import type { GameInfo, move } from "../../../shared/types/GameInfo.js";
import { Player } from "./Player.js";

import type {
    ProcessMoveResult,
    DbFunctions,
    PlayerFinishedResult,
    MoveSubmittedResult,
    PlayerLeaveResult
} from "./types.js";

// ─── Configuration passed to initialize() ────────────────────────────────────

export interface GameInitConfig {
    gameId: string;
    roundId: string;
    word: string;
    roundIndex: number;
    numberOfWords: number;
    wordlistId: string;
    totalPlayers: number;
    /** All words from the wordlist — cached once to avoid per-round DB lookups. */
    wordlistWords: string[];
    /** User IDs of all game players — cached once to avoid per-round DB lookups. */
    gamePlayerIds: string[];
}

// ─── Abstract base ────────────────────────────────────────────────────────────

export abstract class GameMode {
    public word: string = "";
    public startedAt: number = 0;
    public players: Record<string, Player> = {};
    public numberOfWords: number = 0;
    public wordlistId: string = "";
    public roundIndex: number = 0;
    public completedPlayersCount: number = 0;
    public totalPlayersCount: number = 0;
    public currentRoundId: string = "";
    /** Lock to prevent concurrent round transitions (only one player should orchestrate the next round). */
    protected _transitioning: boolean = false;
    /** In-memory profile cache to avoid DB profile fetches on round-end broadcasts. */
    public playerProfiles: Record<string, { username: string; pfp: string }> = {};
    /** Cached wordlist words — loaded once at game start, never re-fetched. */
    public wordlistWords: string[] = [];
    /** Words already used as round words — tracked in-memory to avoid DB queries. */
    public usedWords: Set<string> = new Set();
    /** Cached game player user IDs — loaded once at game start. */
    public gamePlayerIds: string[] = [];
    /**
     * Pending DB insert operations for the current/previous round.
     * Set during setupNextRound, cleared on the NEXT round transition or game end.
     * If the next round finishes before this resolves, the transition awaits it.
     */
    protected _pendingDbOps: Promise<unknown> | null = null;

    constructor(
        public name: string,
        public min_players: number,
        public max_players: number,
        public lives: number
    ) {}

    // ── Must-implement ──────────────────────────────────────────────────────

    abstract satisfies(players_count: number): boolean;
    abstract processMove(userId: string, move: move, gameState: Partial<GameInfo>): ProcessMoveResult;
    /** Reset all per-round state (players, counts, word, startedAt). Called on game start and between rounds. */
    abstract resetRound(word: string): void;
    /** Return final win/loss result for a player across the whole game */
    abstract getFinalResult(userId: string): string;

    // ── Provided by base ────────────────────────────────────────────────────

    /**
     * Initialize game state from DB config, persist game/round status to DB,
     * and return the start payload for the client.
     */
    async initialize(config: GameInitConfig, db: DbFunctions): Promise<{ maskedWord: string[]; startTime: number }> {
        this.numberOfWords = config.numberOfWords;
        this.wordlistId = config.wordlistId;
        this.roundIndex = config.roundIndex;
        this.totalPlayersCount = config.totalPlayers;
        this.currentRoundId = config.roundId;
        this.startedAt = Date.now();

        // Cache wordlist + player IDs + used words at game start (one-time cost)
        this.wordlistWords = config.wordlistWords;
        this.gamePlayerIds = config.gamePlayerIds;
        this.usedWords = new Set([config.word.toLowerCase()]);

        this.resetRound(config.word); // sets word, players, counts

        // Fire-and-forget DB status updates — in-memory state is already set
        const startedAt = new Date(this.startedAt).toISOString();
        Promise.all([
            db.updateGameStatus(config.gameId, "in_progress", startedAt),
            db.updateRoundStatus(config.roundId, "in_progress", startedAt),
        ]).catch(e => console.error("initialize status update:", e));

        return { maskedWord: this.getMaskedWord(undefined), startTime: this.startedAt };
    }

    /**
     * Process a player's move, persist it to DB, and handle finish logic if they completed.
     * Returns everything the route needs to emit — the route does ZERO game logic.
     */
    onMoveSubmitted(
        userId: string,
        move: move,
        gameId: string,
        roundId: string,
        db: DbFunctions,
        checkSocketConnected: () => boolean,
        username?: string,
        pfp?: string
    ): MoveSubmittedResult {
        if (this.currentRoundId !== roundId) {
            return {
                moveResponse: { success: false, error: "Move submitted for an old round." },
                finishPromise: Promise.resolve(null)
            };
        }
        // Cache player profile in memory to avoid DB lookups during broadcasts
        if (username) {
            this.playerProfiles[userId] = { username, pfp: pfp || "" };
        }

        const { player, processedMove, playerResult } = this.processMove(userId, move, {});

        // Build the immediate move response for this player
        const moveResponse = {
            success: true,
            timeTakenMs: player.getTimeTaken(this.startedAt),
            move_set: player.move_set,
            lives: player.lives,
            completed: player.completed,
            maskedWord: this.getMaskedWord(userId),
        };

        // Persist move to DB (fire-and-forget, but guarantee ordering)
        if (processedMove) {
            const insertMoveOp = async () => {
                if (this._pendingDbOps) {
                    await this._pendingDbOps.catch(() => {});
                }
                await db.insertMove({
                    round_id: roundId,
                    user_id: userId,
                    move_index: processedMove.move_index,
                    guess: processedMove.guess,
                    correct: processedMove.correct,
                    created_at: typeof processedMove.timestamp === "string"
                        ? processedMove.timestamp
                        : processedMove.timestamp.toISOString(),
                });
            };
            insertMoveOp().catch(e => console.error("insertMove:", e));
        }

        // Player still playing — just return the move response
        if (playerResult === "in_progress") {
            return { moveResponse, finishPromise: Promise.resolve(null) };
        }

        // Player finished — delegate full orchestration to onPlayerFinished
        const finishPromise = this.onPlayerFinished(
            userId, playerResult, gameId, roundId, db, checkSocketConnected, username, pfp
        );

        return { moveResponse, finishPromise };
    }

    /**
     * Handle a player leaving the game. Cleans up DB state and determines
     * whether the entire game should be abandoned.
     */
    async onPlayerLeave(
        roundId: string,
        gameId: string,
        userId: string,
        db: DbFunctions,
        checkSocketConnected: () => boolean
    ): Promise<PlayerLeaveResult & { transitionResult?: Omit<PlayerFinishedResult, 'playerEvent' | 'broadcastPayload'> | null }> {
        await db.markPlayerAsDisconnectedByRound(roundId, userId);
        const remaining = await db.getActivePlayersCount(roundId);
        this.onPlayerDisconnected(userId);
        
        if (remaining === 0) {
            await db.abandonGameAndRound(gameId, roundId);
            return { gameAbandoned: true };
        }
        
        const transitionResult = await this.triggerRoundTransitionIfNeeded(gameId, roundId, db, checkSocketConnected, []);
        return { gameAbandoned: false, transitionResult };
    }

    /**
     * Adjust in-memory state when a player disconnects mid-game.
     * Must be called AFTER onPlayerLeave so the DB is already updated.
     * Decrements totalPlayersCount so the round can still end when
     * the remaining active players all finish.
     */
    onPlayerDisconnected(userId: string): void {
        if (this.totalPlayersCount > 0) {
            this.totalPlayersCount--;
        }
        if (this.players[userId]?.completed) {
            if (this.completedPlayersCount > 0) {
                this.completedPlayersCount--;
            }
        }
        delete this.players[userId];
    }

    /**
     * Orchestrates everything that needs to happen when a player's round ends:
     * - Fetches the player's profile for broadcast payloads.
     * - Persists round-player result to DB.
     * - If everyone finished: marks the round finished in DB.
     *   - If there is a next round: picks a word, creates the DB row, inserts
     *     round-players, resets in-memory state, and returns the next-round data.
     *   - If no next round: marks the game finished in DB.
     *
     * The route is responsible ONLY for:
     *   - Emitting the returned events over the socket.
     *   - Patching socket.data on all sockets with the new round IDs.
     *   - Removing the game from activeGameInstances when gameFullyEnded.
     */
    async onPlayerFinished(
        userId: string,
        playerResult: "won" | "lost" | "completed",
        gameId: string,
        roundId: string,
        db: DbFunctions,
        checkSocketConnected: () => boolean,
        cachedUsername?: string,
        cachedPfp?: string
    ): Promise<PlayerFinishedResult> {
        const player = this.players[userId];
        if (!player) throw new Error(`Player ${userId} not found in game state.`);
        const timeTakenMs = player.getTimeTaken(this.startedAt);
        const previousWord = this.word;
        const hasNextRound = this.roundIndex < this.numberOfWords;

        // Use cached profile (set in onMoveSubmitted from socket.data.user)
        const cached = this.playerProfiles[userId];
        const username = cachedUsername || cached?.username || "Player";
        const pfp = cachedPfp || cached?.pfp || "";

        // Persist round-player result
        const dbPromises: Promise<any>[] = [];
        const updateResultOp = async () => {
            if (this._pendingDbOps) {
                await this._pendingDbOps.catch(() => {});
            }
            await db.updateRoundPlayerResult(roundId, userId, playerResult);
        };
        dbPromises.push(updateResultOp().catch(console.error));

        const currentScore = 'scores' in this ? (this as any).scores[userId] || 0 : 0;

        // ── Build the event that goes to THIS player ────────────────────────
        const playerEvent: PlayerFinishedResult["playerEvent"] = hasNextRound
            ? {
                name: "game:next_round",
                payload: { roundResult: playerResult, word: previousWord, timeTakenMs, username, pfp, score: currentScore, lives: this.lives }
              }
            : playerResult === "won"
            ? { name: "game:player_won", payload: { userId, timeTakenMs, word: previousWord, username, pfp, score: currentScore } }
            : playerResult === "completed"
            ? { name: "game:player_completed", payload: { userId, timeTakenMs, word: previousWord, username, pfp, score: currentScore } }
            : { name: "game:player_lost", payload: { userId, timeTakenMs, word: previousWord, username, pfp, score: currentScore } };

        // ── Build the broadcast that goes to all OTHER players ──────────────
        const broadcastPayload = { userId, result: playerResult, timeTakenMs, lives: player.lives, username, pfp, score: currentScore };


        const transition = await this.triggerRoundTransitionIfNeeded(gameId, roundId, db, checkSocketConnected, dbPromises);
        if (!transition) {
            return { playerEvent, broadcastPayload, roundEnded: false, gameFullyEnded: false };
        }
        
        const result: PlayerFinishedResult = {
            playerEvent,
            broadcastPayload,
            roundEnded: transition.roundEnded,
            gameFullyEnded: transition.gameFullyEnded,
            leaderboard: 'leaderboard' in transition ? (transition as any).leaderboard : undefined
        };
        if (transition.winnerBroadcastPayload) result.winnerBroadcastPayload = transition.winnerBroadcastPayload;
        if (transition.nextRoundPromise) result.nextRoundPromise = transition.nextRoundPromise;
        if (transition.gameFullyEndedPromise) result.gameFullyEndedPromise = transition.gameFullyEndedPromise;
        
        return result;
    }

    async triggerRoundTransitionIfNeeded(
        gameId: string,
        roundId: string,
        db: DbFunctions,
        checkSocketConnected: () => boolean,
        dbPromises: Promise<any>[] = []
    ): Promise<Omit<PlayerFinishedResult, 'playerEvent' | 'broadcastPayload'> | null> {
        const roundEnded = this.completedPlayersCount >= this.totalPlayersCount;
        
        let winnerBroadcastPayload: Record<string, unknown> | undefined = undefined;
        if (roundEnded && 'winner' in this && typeof (this as any).winner === 'string') {
            const winnerId = (this as any).winner;
            const wPlayer = this.players[winnerId];
            if (wPlayer) {
                const wCached = this.playerProfiles[winnerId];
                let wUsername = wCached?.username;
                let wPfp = wCached?.pfp;
                if (!wUsername) {
                    db.getProfile(winnerId).then(prof => {
                        if (prof) {
                            this.playerProfiles[winnerId] = { username: prof.username, pfp: prof.pfp || "" };
                        }
                    }).catch(() => {});
                    wUsername = "Player";
                    wPfp = "";
                }
                winnerBroadcastPayload = {
                    userId: winnerId,
                    result: "won",
                    timeTakenMs: wPlayer.getTimeTaken(this.startedAt),
                    lives: wPlayer.lives,
                    username: wUsername,
                    pfp: wPfp || "",
                    score: 'scores' in this ? (this as any).scores[winnerId] || 0 : 0
                };
            }
        }

        if (!roundEnded) {
            Promise.all(dbPromises).catch(console.error); // fire and forget
            return null;
        }

        const finishRoundOp = async () => {
            if (this._pendingDbOps) {
                await this._pendingDbOps.catch(() => {});
            }
            await db.finishGameRound(roundId);
        };
        dbPromises.push(finishRoundOp().catch(console.error));

        const hasNextRound = this.roundIndex < this.numberOfWords;
        if (!hasNextRound) {
            const finishGameOp = async () => {
                if (this._pendingDbOps) {
                    await this._pendingDbOps.catch(() => {});
                }
                await db.finishGame(gameId);
                const resultsOps = Object.keys(this.players).map(pid => 
                    db.updateGamePlayerResult(gameId, pid, this.getFinalResult(pid))
                );
                await Promise.all(resultsOps);
            };
            const gameFullyEndedPromise = finishGameOp().catch(console.error);
            
            const leaderboard = Object.keys(this.players).map(pid => {
                const p = this.players[pid];
                const cached = this.playerProfiles[pid] || {};
                return {
                    userId: pid,
                    username: cached.username || "Player",
                    pfp: cached.pfp || "",
                    score: 'scores' in this ? (this as any).scores[pid] || 0 : 0,
                    totalTimeMs: p.getTimeTaken(this.startedAt) // wait, this is only the LAST round's time. We need totalTimeMs if they wanted it, but score is enough to group.
                };
            }).sort((a, b) => b.score - a.score || a.totalTimeMs - b.totalTimeMs);

            return { winnerBroadcastPayload, roundEnded: true, gameFullyEnded: true, gameFullyEndedPromise, leaderboard };
        }

        if (this._transitioning) {
            Promise.all(dbPromises).catch(console.error);
            return { winnerBroadcastPayload, roundEnded: false, gameFullyEnded: false };
        }
        this._transitioning = true;

        const setupNextRound = async () => {
            if (!checkSocketConnected()) {
                await db.abandonGameAndRound(gameId, roundId);
                await Promise.all(dbPromises);
                throw new Error("Socket disconnected during round transition.");
            }
            this.roundIndex += 1;
            const available = this.wordlistWords.filter((w: string) => !this.usedWords.has(w.toLowerCase()));
            const wordPool = available.length > 0 ? available : this.wordlistWords;
            const newWord: string = wordPool[Math.floor(Math.random() * wordPool.length)] as string;
            this.usedWords.add(newWord.toLowerCase());

            const newRoundId = crypto.randomUUID();
            this.startedAt = Date.now();
            this.resetRound(newWord);
            this.currentRoundId = newRoundId;

            const previousDbOps = Promise.all(dbPromises).catch(console.error);
            this._pendingDbOps = previousDbOps.then(() => 
                db.insertNewRound(gameId, this.roundIndex, newWord, newRoundId)
            ).then(newRound => {
                if (!newRound) throw new Error("Failed to insert new round into DB.");
                return db.insertRoundPlayers(
                    this.gamePlayerIds.map(uid => ({ game_round_id: newRound.id, user_id: uid }))
                );
            });
            this._pendingDbOps.catch(e => console.error("background round insert:", e));

            return {
                id: newRoundId,
                maskedWord: this.getMaskedWord(undefined),
                startTime: this.startedAt,
                gamePlayerIds: this.gamePlayerIds,
            };
        };

        return {
            winnerBroadcastPayload,
            roundEnded: true,
            nextRoundPromise: setupNextRound().finally(() => { this._transitioning = false; }),
            gameFullyEnded: false
        };
    }

    // ── Utility ────────────────────────────────────────────────────────────

    getMaskedWord(userId: string | undefined): string[] {
        const player = this.players[userId!];
        if (!player) {
            return Array.from(this.word.replace(/[A-Za-z]/g, "_"));
        }
        return this.word.split("").map(letter => {
            if (!/[a-z]/i.test(letter)) return letter;
            return player.move_set.includes(letter.toLowerCase()) ? letter.toUpperCase() : "_";
        });
    }
}