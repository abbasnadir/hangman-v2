import type { GameInfo, move } from "../../shared/types/GameInfo.js";
import { Player } from "./Player.js";

// ─── Return type of processMove (used internally by onMoveSubmitted) ────────

export interface ProcessMoveResult {
    player: Player;
    processedMove: { guess: string; correct: boolean; timestamp: Date | string; move_index: number } | null;
    playerResult: "won" | "lost" | "completed" | "in_progress";
    roundEnded: boolean;
    hasNextRound: boolean;
}

// ─── DB helpers injected from the route ─────────────────────────────────────

export interface DbFunctions {
    insertMove(move: { round_id: string; user_id: string; move_index: number; guess: string; correct: boolean; created_at: string }): Promise<void>;
    getWordlistWords(wordlistId: string): Promise<string[]>;
    getUsedWordsInGame(gameId: string): Promise<Set<string>>;
    insertNewRound(gameId: string, roundIndex: number, word: string): Promise<{ id: string } | null>;
    getGamePlayers(gameId: string): Promise<{ user_id: string }[] | null>;
    insertRoundPlayers(players: { game_round_id: string; user_id: string }[]): Promise<{ id: string; user_id: string }[] | null>;
    finishGameRound(roundId: string): Promise<void>;
    finishGame(gameId: string): Promise<void>;
    updateGamePlayerResult(gameId: string, userId: string, result: string): Promise<void>;
    updateRoundPlayerResult(roundId: string, userId: string, result: string): Promise<void>;
    getProfile(userId: string): Promise<{ username: string; pfp: string } | null>;
    abandonGameAndRound(gameId: string, roundId: string): Promise<void>;
    markPlayerAsDisconnected(roundPlayerId: string): Promise<void>;
    getActivePlayersCount(roundId: string): Promise<number>;
    updateGameStatus(gameId: string, status: string, startedAt: string): Promise<void>;
    updateRoundStatus(roundId: string, status: string, startedAt: string): Promise<void>;
}

// ─── What onPlayerFinished returns ──────────────────────────────────────────

export interface PlayerFinishedResult {
    /** The socket event to emit to the player who just finished. */
    playerEvent: {
        name: "game:player_won" | "game:player_lost" | "game:player_completed" | "game:next_round";
        payload: Record<string, unknown>;
    };
    /** Payload for the game:player_finished_broadcast event sent to all *other* players. */
    broadcastPayload: Record<string, unknown>;
    /** True when every player in this round has now finished. */
    roundEnded: boolean;
    /**
     * Populated only when roundEnded === true AND the game has more rounds.
     * Contains everything needed to transition sockets to the new round.
     */
    nextRoundPromise?: Promise<{
        id: string;
        maskedWord: string[];
        startTime: number;
        /** userId → roundPlayerId mapping, so the route can patch socket.data on all sockets. */
        playerMap: Record<string, string>;
    } | null>;
    /** True when roundEnded === true AND there are no more rounds (game over). */
    gameFullyEnded: boolean;
}

// ─── What onMoveSubmitted returns ───────────────────────────────────────────

export interface MoveSubmittedResult {
    /** Payload for the `game:submit_move` response to this player. */
    moveResponse: Record<string, unknown>;
    /** If the player finished, contains a promise to the full finish orchestration result. */
    finishPromise: Promise<PlayerFinishedResult | null>;
}

// ─── What onPlayerLeave returns ─────────────────────────────────────────────

export interface PlayerLeaveResult {
    /** Whether the game was abandoned (no players left). */
    gameAbandoned: boolean;
}

// ─── Configuration passed to initialize() ────────────────────────────────────

export interface GameInitConfig {
    gameId: string;
    roundId: string;
    word: string;
    roundIndex: number;
    numberOfWords: number;
    wordlistId: string;
    totalPlayers: number;
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
        this.resetRound(config.word); // sets word, players, counts, startedAt

        const startedAt = new Date(this.startedAt).toISOString();
        await Promise.all([
            db.updateGameStatus(config.gameId, "in_progress", startedAt),
            db.updateRoundStatus(config.roundId, "in_progress", startedAt),
        ]);

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

        // Persist move to DB (fire-and-forget)
        if (processedMove) {
            db.insertMove({
                round_id: roundId,
                user_id: userId,
                move_index: processedMove.move_index,
                guess: processedMove.guess,
                correct: processedMove.correct,
                created_at: typeof processedMove.timestamp === "string"
                    ? processedMove.timestamp
                    : processedMove.timestamp.toISOString(),
            }).catch(e => console.error("insertMove:", e));
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
        roundPlayerId: string,
        roundId: string,
        gameId: string,
        db: DbFunctions
    ): Promise<PlayerLeaveResult> {
        await db.markPlayerAsDisconnected(roundPlayerId);
        const remaining = await db.getActivePlayersCount(roundId);
        if (remaining === 0) {
            await db.abandonGameAndRound(gameId, roundId);
            return { gameAbandoned: true };
        }
        return { gameAbandoned: false };
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

        // Fetch display profile (non-blocking; errors fall back to defaults)
        const profile = await db.getProfile(userId).catch(() => null);
        const username = cachedUsername || profile?.username || "Player";
        const pfp = cachedPfp || profile?.pfp || "";

        // Persist round-player result
        const dbPromises: PromiseLike<unknown>[] = [];
        dbPromises.push(db.updateRoundPlayerResult(roundId, userId, playerResult).catch(console.error));

        const currentScore = 'scores' in this ? (this as any).scores[userId] || 0 : 0;

        // ── Build the event that goes to THIS player ────────────────────────
        const playerEvent: PlayerFinishedResult["playerEvent"] = hasNextRound
            ? {
                name: "game:next_round",
                payload: { roundResult: playerResult, word: previousWord, timeTakenMs, username, pfp, score: currentScore }
              }
            : playerResult === "won"
            ? { name: "game:player_won", payload: { userId, timeTakenMs, word: previousWord, username, pfp, score: currentScore } }
            : playerResult === "completed"
            ? { name: "game:player_completed", payload: { userId, timeTakenMs, username, pfp, score: currentScore } }
            : { name: "game:player_lost", payload: { userId, word: previousWord, username, pfp, score: currentScore } };

        // ── Build the broadcast that goes to all OTHER players ──────────────
        const broadcastPayload = { userId, result: playerResult, timeTakenMs, lives: player.lives, username, pfp, score: currentScore };

        const roundEnded = this.completedPlayersCount >= this.totalPlayersCount;

        if (!roundEnded) {
            Promise.all(dbPromises).catch(console.error); // fire and forget
            return { playerEvent, broadcastPayload, roundEnded: false, gameFullyEnded: false };
        }

        // ── Everyone is done with this round ────────────────────────────────
        dbPromises.push(db.finishGameRound(roundId).catch(console.error));

        if (!hasNextRound) {
            // ── Game is fully over ──────────────────────────────────────────
            dbPromises.push(db.finishGame(gameId).catch(console.error));
            dbPromises.push(db.updateGamePlayerResult(gameId, userId, playerResult).catch(console.error));
            Promise.all(dbPromises).catch(console.error); // fire and forget
            return { playerEvent, broadcastPayload, roundEnded: true, gameFullyEnded: true };
        }

        // ── Transition to next round ────────────────────────────────────────

        const setupNextRound = async () => {
            if (!checkSocketConnected()) {
                console.log("[next_round] Socket disconnected during round transition, abandoning");
                await db.abandonGameAndRound(gameId, roundId);
                await Promise.all(dbPromises);
                throw new Error("Socket disconnected during round transition.");
            }

            this.roundIndex += 1;

            const words = await db.getWordlistWords(this.wordlistId);
            const usedWords = await db.getUsedWordsInGame(gameId);
            const available = words.filter((w: string) => !usedWords.has(w.toLowerCase()));
            const wordPool = available.length > 0 ? available : words;
            const newWord: string = wordPool[Math.floor(Math.random() * wordPool.length)] as string;
            if (!newWord) throw new Error("Word pool is empty.");

            if (!checkSocketConnected()) {
                console.log("[next_round] Socket disconnected before round insert, abandoning");
                await db.abandonGameAndRound(gameId, roundId);
                await Promise.all(dbPromises);
                throw new Error("Socket disconnected before round insert.");
            }

            const newRound = await db.insertNewRound(gameId, this.roundIndex, newWord);
            if (!newRound) throw new Error("Failed to create next round in DB.");

            const gamePlayers = await db.getGamePlayers(gameId);
            if (!gamePlayers) throw new Error("Failed to fetch game players for next round.");

            const insertedPlayers = await db.insertRoundPlayers(
                gamePlayers.map(gp => ({ game_round_id: newRound.id, user_id: gp.user_id }))
            );

            if (!insertedPlayers) throw new Error("Failed to insert round players for next round.");

            if (!checkSocketConnected()) {
                console.log("[next_round] Socket disconnected after round insert, cleaning up orphan");
                for (const ip of insertedPlayers) {
                    await db.markPlayerAsDisconnected(ip.id);
                }
                await db.abandonGameAndRound(gameId, newRound.id);
                await Promise.all(dbPromises);
                throw new Error("Socket disconnected after round insert.");
            }

            const playerMap = Object.fromEntries(insertedPlayers.map(p => [p.user_id, p.id]));

            this.resetRound(newWord);

            await Promise.all(dbPromises);

            return {
                id: newRound.id,
                maskedWord: this.getMaskedWord(undefined),
                startTime: this.startedAt,
                playerMap
            };
        };

        return {
            playerEvent,
            broadcastPayload,
            roundEnded: true,
            nextRoundPromise: setupNextRound(),
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