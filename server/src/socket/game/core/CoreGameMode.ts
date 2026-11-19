import type { Socket } from "socket.io";
import crypto from "crypto";
import { submitMovePayloadSchema } from "../../schemas/gameProcessSchema.js";
import * as db from "../../../shared/utils/dbQueries.js";
import { activeGameInstances } from "./registry.js";
import type { GameInfo, move } from "../../../shared/types/GameInfo.js";
import { Player } from "./Player.js";

import type {
    ProcessMoveResult,
    PlayerFinishedResult,
    MoveSubmittedResult,
    RoundTransitionResult,
    TimerPayload
} from "../../types/gameCore.js";

export interface GameInitConfig {
    gameId: string;
    roundId: string;
    word: string;
    roundIndex: number;
    numberOfWords: number;
    wordlistId: string;
    totalPlayers: number;
    wordlistWords: string[];
    gamePlayerIds: string[];
}

export abstract class CoreGameMode {
    public word: string = "";
    public startedAt: number = 0;
    public players: Record<string, Player> = {};
    public numberOfWords: number = 0;
    public wordlistId: string = "";
    public roundIndex: number = 0;
    public completedPlayersCount: number = 0;
    public totalPlayersCount: number = 0;
    public currentRoundId: string = "";
    protected _transitioning: boolean = false;
    protected _gameEnded: boolean = false;
    public playerProfiles: Record<string, { username: string; pfp: string }> = {};
    public wordlistWords: string[] = [];
    public usedWords: Set<string> = new Set();
    public gamePlayerIds: string[] = [];
    protected _pendingDbOps: Promise<unknown> | null = null;
    public createdBy: string = "";
    public abandonTimer?: NodeJS.Timeout;

    constructor(
        public name: string,
        public min_players: number,
        public max_players: number,
        public lives: number
    ) {}

    // ── Must-implement ──────────────────────────────────────────────────────

    abstract satisfies(players_count: number): boolean;
    abstract evaluatePlayerResult(userId: string, isSolved: boolean): "won" | "lost" | "completed" | "in_progress";
    abstract resetRound(word: string): void;
    abstract getFinalResult(userId: string): string;

    public ensurePlayer(userId: string): Player {
        if (!this.players[userId]) {
            this.players[userId] = new Player(userId, this.lives);
            if ('scores' in this && (this as any).scores[userId] === undefined) {
                (this as any).scores[userId] = 0;
            }
        }
        return this.players[userId];
    }

    public processMove(userId: string, move: move, _gameState: Partial<GameInfo>): ProcessMoveResult {
        const player = this.ensurePlayer(userId);
        const hasNextRound = this.roundIndex < this.numberOfWords;

        if (player.completed) {
            return {
                player,
                processedMove: null,
                playerResult: "in_progress",
                roundEnded: this.completedPlayersCount >= this.totalPlayersCount,
                hasNextRound
            };
        }

        // A player can fail without guessing (e.g. their clock ran out). Never accept a
        // guess after that point, otherwise a late correct guess could still win the round.
        if (this.hasPlayerFailed(player)) {
            player.finish(this.startedAt);
            this.completedPlayersCount++;
            return {
                player,
                processedMove: null,
                playerResult: this.evaluatePlayerResult(userId, false),
                roundEnded: this.completedPlayersCount >= this.totalPlayersCount,
                hasNextRound
            };
        }

        const guess = move.guess.toLowerCase();

        if (player.move_set.includes(guess)) {
            return {
                player,
                processedMove: null,
                playerResult: "in_progress",
                roundEnded: this.completedPlayersCount >= this.totalPlayersCount,
                hasNextRound
            };
        }

        const isCorrect = this.word.toLowerCase().includes(guess);
        player.recordGuess(guess, isCorrect, this.startedAt, this.wrongGuessCostsLife());

        const isSolved = !this.getMaskedWord(userId).includes("_");

        let playerResult: "won" | "lost" | "in_progress" | "completed" = "in_progress";

        if (isSolved || player.completed || this.hasPlayerFailed(player)) {
            player.finish(this.startedAt);
            this.completedPlayersCount++;
            playerResult = this.evaluatePlayerResult(userId, isSolved);
        }

        const processedMove = { guess, correct: isCorrect, timestamp: move.timestamp, move_index: player.move_index };

        return {
            player,
            processedMove,
            playerResult,
            roundEnded: this.completedPlayersCount >= this.totalPlayersCount,
            hasNextRound
        };
    }

    // ── Virtual Hooks (Overridden by SinglePlayerMode / MultiplayerMode / modes) ──

    getPlayerScore(userId: string): number { return 0; }
    getScoresSnapshot(): Record<string, number> { return {}; }
    async fetchLobbyPlayers(roundId: string, gameId: string, totalLives: number): Promise<any[]> { return []; }
    shouldBroadcastPlayerEvents(): boolean { return false; }
    buildWinnerPayload(): any { return null; }
    buildLeaderboard(gamePlayerIds: string[], players: Record<string, Player>, playerProfiles: Record<string, { username: string; pfp: string }>): any[] {
        return gamePlayerIds.map(pid => ({
            userId: pid,
            username: playerProfiles[pid]?.username || "Unknown",
            pfp: playerProfiles[pid]?.pfp || "",
            score: 0,
            totalTimeMs: players[pid]?.finalTime || 0,
            result: this.getFinalResult(pid),
        })).sort((a, b) => (players[a.userId]?.finalTime || 0) - (players[b.userId]?.finalTime || 0));
    }

    /** Whether a wrong guess removes a life. Timed modes penalise with time instead. */
    protected wrongGuessCostsLife(): boolean { return true; }

    /** Whether the player has lost the round without solving the word. */
    protected hasPlayerFailed(player: Player): boolean { return player.lives <= 0; }

    /** Extra timer information sent to clients of timed modes. */
    public getTimerPayload(_userId: string): TimerPayload | {} { return {}; }

    /** Called whenever a player's round clock (re)starts: game start, next round, or rejoin. */
    protected onPlayerRoundActive(_socket: Socket, _userId: string): void {}

    /** Release timers and other resources held by this game instance. */
    public dispose(): void {
        if (this.abandonTimer) {
            clearTimeout(this.abandonTimer);
            delete this.abandonTimer;
        }
    }

    // ── Base Logic ──────────────────────────────────────────────────────────

    public enqueueDbOp<T>(op: () => Promise<T>): Promise<T> {
        const previous = this._pendingDbOps || Promise.resolve();
        const next = previous.then(() => op()).catch(err => {
            console.error("Background DB Op Error:", err);
        });
        this._pendingDbOps = next;
        return next as Promise<T>;
    }

    async initialize(config: GameInitConfig, dbInstance: any): Promise<{ maskedWord: string[]; startTime: number }> {
        this.currentRoundId = config.roundId;
        this.numberOfWords = config.numberOfWords;
        this.wordlistId = config.wordlistId;
        this.roundIndex = config.roundIndex;
        this.totalPlayersCount = config.totalPlayers;
        this.wordlistWords = config.wordlistWords;
        this.gamePlayerIds = config.gamePlayerIds;
        this.startedAt = Date.now();

        this.resetRound(config.word);

        const startedAtIso = new Date(this.startedAt).toISOString();
        await Promise.all([
            dbInstance.updateGameStatus(config.gameId, "in_progress", startedAtIso),
            dbInstance.updateRoundStatus(config.roundId, "in_progress", startedAtIso)
        ]);

        return {
            maskedWord: this.getMaskedWord(undefined),
            startTime: this.startedAt
        };
    }

    public getMaskedWord(userId: string | undefined): string[] {
        const guessedLetters = userId && this.players[userId] ? this.players[userId].move_set : [];
        // Only a-z can be guessed, so anything else (spaces, hyphens, apostrophes, digits)
        // is revealed up front; otherwise such words could never be solved.
        return this.word.split("").map(char => {
            const lower = char.toLowerCase();
            if (!/^[a-z]$/.test(lower)) return char;
            return guessedLetters.includes(lower) ? char : "_";
        });
    }

    private async loadInstanceState(socket: Socket, gameId: string, gameStatus: any) {
        const [roundInfo, wordlistWords, gamePlayersData, usedRoundWords] = await Promise.all([
            db.fetchRoundInfo(socket.data.user.currentRoundId),
            db.getWordlistWords(gameStatus.wordlist_id),
            db.getGamePlayers(gameId),
            db.getUsedWordsInGame(gameId),
        ]);
        if (!roundInfo.error && roundInfo.data) {
            this.word = roundInfo.data.word;
            this.roundIndex = roundInfo.data.round_index;
            if (roundInfo.data.started_at && gameStatus.status === "in_progress") {
                this.startedAt = new Date(roundInfo.data.started_at).getTime();
            }
        }
        this.wordlistWords = wordlistWords ?? [];
        this.gamePlayerIds = (gamePlayersData ?? []).map((gp: any) => gp.user_id);
        this.usedWords = usedRoundWords ?? new Set<string>();
        this.currentRoundId = socket.data.user.currentRoundId;
    }

    // ── Action Methods ──────────────────────────────────────────────────────

    async handleJoin(socket: Socket, gameId: string, userId: string, dbData: any) {
        const { gameStatus, existingPlayer, activeRounds } = dbData;
        const isHost = gameStatus.created_by === userId;
        const modeId = gameStatus.mode_id;

        if (existingPlayer) {
            let roundPlayer: { id: string } | null = null;
            if (activeRounds && activeRounds.length > 0) {
                const round = activeRounds[0];
                roundPlayer = await db.getRoundPlayer(round.id, userId).catch(() => null);
                if (roundPlayer) await db.markPlayerAsActive(roundPlayer.id).catch(console.error);

                socket.data.user.currentGameId = gameId;
                socket.data.user.currentRoundId = round.id;
                socket.data.user.currentRoundPlayerId = roundPlayer?.id ?? null;
            }

            if (!socket.data.user.currentRoundId) {
                socket.emit("game:join", { success: false, error: "No active round available to join." });
                return;
            }

            if (!activeGameInstances[gameId]) {
                await this.loadInstanceState(socket, gameId, gameStatus);
                this.totalPlayersCount = await db.getActivePlayersCount(socket.data.user.currentRoundId);
                activeGameInstances[gameId] = this;
            }

            // Someone came back in time: the game is no longer abandoned.
            if (this.abandonTimer) {
                clearTimeout(this.abandonTimer);
                delete this.abandonTimer;
            }

            let started = false;
            let maskedWord: string[] | undefined = undefined;
            let startTime: number | undefined = undefined;
            let lives = gameStatus.total_lives;
            let move_set: string[] = [];
            let playersCount = await db.getActivePlayersCount(socket.data.user.currentRoundId);

            if (this.startedAt && gameStatus.status === 'in_progress') {
                let player = this.players[userId];

                if (!player) {
                    // No in-memory state (server restart, or no move made yet this round).
                    // Only players that are part of the current round may continue.
                    if (!roundPlayer) {
                        socket.leave(gameId);
                        delete socket.data.user.currentGameId;
                        delete socket.data.user.currentRoundId;
                        delete socket.data.user.currentRoundPlayerId;
                        socket.emit("game:join", { success: false, error: "You abandoned this game and cannot rejoin." });
                        return;
                    }
                    player = this.ensurePlayer(userId);
                    player.startRound(Date.now());
                } else if (player.disconnected) {
                    this.totalPlayersCount++;
                    if (player.completed) {
                        this.completedPlayersCount++;
                    }
                    player.disconnected = false;
                }

                started = true;
                startTime = this.startedAt;
                lives = player.lives;
                move_set = player.move_set;
                maskedWord = this.getMaskedWord(userId);
                playersCount = this.totalPlayersCount;
            } else {
                // Lobby: the database is the source of truth for who is waiting.
                if (this.players[userId]) this.players[userId].disconnected = false;
                this.totalPlayersCount = playersCount;
            }

            socket.join(gameId);
            const existingPlayers = await this.fetchLobbyPlayers(socket.data.user.currentRoundId, gameId, gameStatus.total_lives);

            socket.emit("game:join", {
                success: true, gameId, userId, reconnected: true, isHost, modeId, playersCount, started, maskedWord, startTime, lives, move_set, username: socket.data.user.username, existingPlayers, totalLives: gameStatus.total_lives,
                ...this.getTimerPayload(userId)
            });

            if (started) {
                this.onPlayerRoundActive(socket, userId);
            }

            if (this.shouldBroadcastPlayerEvents()) {
                socket.to(gameId).emit("game:player_joined", { userId, playersCount, username: socket.data.user.username });
            }
            return;
        }

        if (gameStatus.status !== "created" || this.startedAt) {
            socket.emit("game:join", { success: false, error: "This game has already started." });
            return;
        }

        if (!activeRounds || activeRounds.length === 0) {
            socket.emit("game:join", { success: false, error: "No active round available to join." });
            return;
        }
        const roundToJoin = activeRounds[0];

        const currentCount = await db.getActivePlayersCount(roundToJoin.id);
        if (currentCount >= this.max_players) {
            socket.emit("game:join", { success: false, error: "This game is full." });
            return;
        }

        const [gpResult, rpResult] = await Promise.all([
            db.insertGamePlayer(gameId, userId),
            db.insertGameRoundPlayer(roundToJoin.id, userId)
        ]);

        if (gpResult.error) {
            socket.emit("game:join", { success: false, error: "Failed to join game: " + gpResult.error.message });
            return;
        }

        if (rpResult.error || !rpResult.data) {
            await db.deleteGamePlayer(gameId, userId);
            socket.emit("game:join", { success: false, error: "Failed to join round: " + rpResult.error?.message });
            return;
        }
        const newRoundPlayer = rpResult.data;

        socket.data.user.currentGameId = gameId;
        socket.data.user.currentRoundId = roundToJoin.id;
        socket.data.user.currentRoundPlayerId = newRoundPlayer.id;

        socket.join(gameId);

        if (!activeGameInstances[gameId]) {
            await this.loadInstanceState(socket, gameId, gameStatus);
            activeGameInstances[gameId] = this;
        }

        const [playersCount, existingPlayers] = await Promise.all([
            db.getActivePlayersCount(roundToJoin.id),
            this.fetchLobbyPlayers(roundToJoin.id, gameId, gameStatus.total_lives)
        ]);

        this.totalPlayersCount = playersCount;
        if (!this.gamePlayerIds.includes(userId)) {
            this.gamePlayerIds.push(userId);
        }

        socket.emit("game:join", {
            success: true, gameId, userId, reconnected: false, isHost, modeId, playersCount, username: socket.data.user.username, existingPlayers, totalLives: gameStatus.total_lives,
            ...this.getTimerPayload(userId)
        });
        if (this.shouldBroadcastPlayerEvents()) {
            socket.to(gameId).emit("game:player_joined", { userId, playersCount, existingPlayers, username: socket.data.user.username });
        }
    }

    async handleStart(socket: Socket) {
        const userId = socket.data.user.id;
        if (userId !== this.createdBy) {
            socket.emit("game:start", { success: false, error: "Only the host can start the game." });
            return;
        }
        if (this.startedAt) {
            socket.emit("game:start", { success: false, error: "This game has already been started." });
            return;
        }
        if (!this.satisfies(this.totalPlayersCount)) {
            socket.emit("game:start", { success: false, error: `Player count not met. Have ${this.totalPlayersCount}, need ${this.min_players}–${this.max_players}.` });
            return;
        }

        const gameId = socket.data.user.currentGameId;
        const currentRoundId = socket.data.user.currentRoundId;

        const startTime = Date.now();
        this.startedAt = startTime;

        const startedAtIso = new Date(startTime).toISOString();
        Promise.all([
            db.updateGameStatus(gameId, "in_progress", startedAtIso),
            db.updateRoundStatus(currentRoundId, "in_progress", startedAtIso),
        ]).catch(console.error);

        this.ensurePlayer(userId).startRound(startTime);

        const startPayload = {
            success: true,
            maskedWord: this.getMaskedWord(userId),
            lives: this.lives,
            startTime,
            ...this.getTimerPayload(userId)
        };
        socket.emit("game:start", startPayload);
        socket.to(gameId).emit("game:start", startPayload);

        this.onPlayerRoundActive(socket, userId);
    }

    async handleStartNextRound(socket: Socket) {
        const userId = socket.data.user.id;
        const gameId = socket.data.user.currentGameId;

        if (this.currentRoundId) {
            socket.data.user.currentRoundId = this.currentRoundId;
        }

        const hadPlayer = !!this.players[userId];
        const player = this.ensurePlayer(userId);

        // Only start the clock once per round. Without this guard a client could call
        // this mid-round to wipe its guesses / "completed" flag and replay the word.
        if (!hadPlayer || (!player.startedAt && player.move_index === 0 && !player.completed)) {
            player.startRound(Date.now());
        }

        socket.emit("game:started_round", {
            success: true,
            startTime: player.startedAt || this.startedAt,
            lives: player.lives,
            maskedWord: this.getMaskedWord(userId),
            ...this.getTimerPayload(userId)
        });

        if (gameId && !player.completed) {
            this.onPlayerRoundActive(socket, userId);
        }
    }

    async handleSubmitMove(socket: Socket, payload: any) {
        const parsed = submitMovePayloadSchema.safeParse(payload);
        if (!parsed.success) {
            socket.emit("game:submit_move", { success: false, error: "Invalid payload format." });
            return;
        }
        if (!this.startedAt) {
            socket.emit("game:submit_move", { success: false, error: "The game has not started yet." });
            return;
        }
        const { guess, timestamp } = parsed.data;
        const userId = socket.data.user.id;
        const gameId = socket.data.user.currentGameId;
        const roundId = socket.data.user.currentRoundId;
        const username = socket.data.user.username;
        const pfp = socket.data.user.pfp;

        const { moveResponse, finishPromise } = this.onMoveSubmitted(
            userId,
            { guess, timestamp: new Date(timestamp) },
            gameId,
            roundId,
            db,
            this.socketConnectedChecker(socket),
            username,
            pfp
        );

        socket.emit("game:submit_move", moveResponse);

        if (finishPromise) {
            await this.dispatchFinishResult(socket, gameId, await finishPromise);
        }
    }

    /**
     * Ends the round for a player who failed without making a move (e.g. timer ran out)
     * and runs the same finish / round transition flow as a losing guess.
     */
    async forceFailPlayer(socket: Socket) {
        const userId = socket.data.user.id;
        const gameId = socket.data.user.currentGameId;
        const roundId = this.currentRoundId;
        const player = this.players[userId];
        if (!gameId || !player || player.completed) return;

        player.finish(this.startedAt);
        this.completedPlayersCount++;
        const playerResult = this.evaluatePlayerResult(userId, false);

        socket.emit("game:submit_move", {
            success: true,
            maskedWord: this.getMaskedWord(userId),
            lives: player.lives,
            completed: true,
            result: playerResult,
            timeTakenMs: player.finalTime,
            roundEnded: this.completedPlayersCount >= this.totalPlayersCount,
            move_set: player.move_set,
            ...this.getTimerPayload(userId)
        });

        const finishResult = await this.onPlayerFinished(
            userId, gameId, roundId, player, playerResult,
            this.roundIndex < this.numberOfWords, db, this.socketConnectedChecker(socket)
        );
        await this.dispatchFinishResult(socket, gameId, finishResult);
    }

    async handleLeave(socket: Socket) {
        const userId = socket.data.user.id;
        const gameId = socket.data.user.currentGameId;
        const roundId = socket.data.user.currentRoundId;

        const { gameAbandoned, transitionResult } = await this.onPlayerLeave(
            roundId, gameId, userId, db, this.socketConnectedChecker(socket)
        );

        if (gameAbandoned) {
            this.scheduleAbandon(socket, gameId, roundId);
        }

        if (transitionResult) {
            if (transitionResult.winnerBroadcastPayload) {
                socket.to(gameId).emit("game:player_finished_broadcast", transitionResult.winnerBroadcastPayload);
            }
            await this.dispatchRoundTransition(socket, gameId, transitionResult, false);
        }

        delete socket.data.user.currentGameId;
        delete socket.data.user.currentRoundId;
        delete socket.data.user.currentRoundPlayerId;

        socket.leave(gameId);
        socket.emit("game:leave", { success: true, word: this.word });

        if (this.shouldBroadcastPlayerEvents()) {
            socket.to(gameId).emit("game:player_left", { userId, playersCount: this.totalPlayersCount, username: socket.data.user.username });
        }
    }

    async handleDisconnect(socket: Socket, reason: string) {
        const userId = socket.data.user.id;
        const gameId = socket.data.user.currentGameId;
        const roundId = socket.data.user.currentRoundId;

        for (const [id, clientSocket] of socket.nsp.sockets) {
            if (id !== socket.id && clientSocket.data.user?.id === userId && clientSocket.data.user?.currentGameId === gameId) {
                return;
            }
        }

        const { gameAbandoned, transitionResult } = await this.onPlayerLeave(
            roundId, gameId, userId, db, this.socketConnectedChecker(socket)
        );

        if (gameAbandoned) {
            this.scheduleAbandon(socket, gameId, roundId);
        }

        if (transitionResult) {
            if (transitionResult.winnerBroadcastPayload) {
                socket.to(gameId).emit("game:player_finished_broadcast", transitionResult.winnerBroadcastPayload);
            }
            await this.dispatchRoundTransition(socket, gameId, transitionResult, false);
        }

        if (this.shouldBroadcastPlayerEvents()) {
            socket.to(gameId).emit("game:player_disconnected", { userId, reason, playersCount: this.totalPlayersCount, username: socket.data.user.username });
        }
    }

    protected socketConnectedChecker(socket: Socket) {
        return (uid: string) => {
            for (const [, clientSocket] of socket.nsp.sockets) {
                if (clientSocket.data.user?.id === uid) return true;
            }
            return false;
        };
    }

    private scheduleAbandon(socket: Socket, gameId: string, roundId: string) {
        if (this.abandonTimer) clearTimeout(this.abandonTimer);
        this.abandonTimer = setTimeout(async () => {
            delete this.abandonTimer;
            if (activeGameInstances[gameId] === this) delete activeGameInstances[gameId];
            this.dispose();
            socket.to(gameId).emit("game:abandoned");
            await db.abandonGameAndRound(gameId, roundId).catch(console.error);
        }, 10000);
    }

    protected async dispatchFinishResult(socket: Socket, gameId: string, finishResult: PlayerFinishedResult | null) {
        if (!finishResult) return;

        socket.emit(finishResult.playerEvent, finishResult.playerPayload);
        socket.to(gameId).emit("game:player_finished_broadcast", finishResult.broadcastPayload);

        if (finishResult.winnerBroadcastPayload) {
            socket.emit("game:player_finished_broadcast", finishResult.winnerBroadcastPayload);
            socket.to(gameId).emit("game:player_finished_broadcast", finishResult.winnerBroadcastPayload);
        }

        await this.dispatchRoundTransition(socket, gameId, finishResult, true);
    }

    protected async dispatchRoundTransition(
        socket: Socket,
        gameId: string,
        transition: Pick<RoundTransitionResult, "nextRoundPromise" | "gameFullyEndedPromise" | "leaderboard">,
        includeSelf: boolean
    ) {
        const emitAll = (event: string, payload?: unknown) => {
            if (includeSelf) socket.emit(event, payload);
            socket.to(gameId).emit(event, payload);
        };

        if (transition.nextRoundPromise) {
            const nextRoundData = await transition.nextRoundPromise;
            if (!nextRoundData) return;

            for (const [, clientSocket] of socket.nsp.sockets) {
                if (clientSocket.data.user?.currentGameId === gameId) {
                    clientSocket.data.user.currentRoundId = nextRoundData.id;
                }
            }
            emitAll("game:new_round_ready", nextRoundData);
        } else if (transition.gameFullyEndedPromise) {
            await transition.gameFullyEndedPromise;
            emitAll("game:fully_completed", {
                result: "game_ended",
                leaderboard: transition.leaderboard,
                finalScores: this.getScoresSnapshot()
            });
            if (activeGameInstances[gameId] === this) delete activeGameInstances[gameId];
            this.dispose();
        }
    }

    onMoveSubmitted(
        userId: string,
        move: move,
        gameId: string,
        roundId: string,
        dbInstance: any,
        checkSocketConnected: (userId: string) => boolean,
        username?: string,
        pfp?: string
    ): MoveSubmittedResult {
        if (this.currentRoundId !== roundId) {
            return {
                moveResponse: { success: false, error: "Stale round submission." },
                finishPromise: Promise.resolve(null)
            };
        }

        if (username !== undefined && pfp !== undefined) {
            this.playerProfiles[userId] = { username, pfp };
        }

        const { player, processedMove, playerResult, roundEnded, hasNextRound } = this.processMove(userId, move, {});

        // Duplicate guesses and guesses after the player finished are ignored, so don't log them.
        if (processedMove) {
            this.enqueueDbOp(() => dbInstance.insertMove({
                round_id: roundId,
                user_id: userId,
                move_index: processedMove.move_index,
                guess: processedMove.guess,
                correct: processedMove.correct,
                created_at: move.timestamp.toISOString(),
            }));
        }

        const moveResponse = {
            success: true,
            maskedWord: this.getMaskedWord(userId),
            guess: move.guess,
            isCorrect: processedMove ? processedMove.correct : false,
            lives: player.lives,
            completed: player.completed,
            result: playerResult,
            timeTakenMs: player.getTimeTaken(this.startedAt),
            roundEnded,
            move_set: player.move_set,
            ...this.getTimerPayload(userId)
        };

        if (playerResult === "in_progress") {
            return { moveResponse, finishPromise: Promise.resolve(null) };
        }

        const finishPromise = this.onPlayerFinished(
            userId, gameId, roundId, player, playerResult, hasNextRound, dbInstance, checkSocketConnected
        );

        return { moveResponse, finishPromise };
    }

    async onPlayerFinished(
        userId: string,
        gameId: string,
        roundId: string,
        player: Player,
        playerResult: "won" | "lost" | "completed" | "in_progress",
        hasNextRound: boolean,
        dbInstance: any,
        checkSocketConnected: (userId: string) => boolean
    ): Promise<PlayerFinishedResult> {
        this.enqueueDbOp(() => dbInstance.updateRoundPlayerResult(
            roundId,
            userId,
            playerResult
        ));

        let playerEvent: "game:player_won" | "game:player_lost" | "game:player_completed" | "game:next_round";
        if (hasNextRound) {
            playerEvent = "game:next_round";
        } else {
            playerEvent = playerResult === "won" ? "game:player_won" : playerResult === "completed" ? "game:player_completed" : "game:player_lost";
        }

        const profile = this.playerProfiles[userId] || { username: "Player", pfp: "" };

        const playerPayload = {
            userId,
            roundResult: playerResult,
            word: this.word,
            timeTakenMs: player.finalTime,
            username: profile.username,
            pfp: profile.pfp,
            score: this.getPlayerScore(userId),
            lives: player.lives
        };

        const broadcastPayload = {
            userId,
            result: playerResult,
            username: profile.username,
            pfp: profile.pfp,
            lives: player.lives,
            timeTakenMs: player.finalTime,
            score: this.getPlayerScore(userId)
        };

        const transitionResult = await this.triggerRoundTransitionIfNeeded(gameId, roundId, dbInstance, checkSocketConnected);

        return {
            playerEvent,
            playerPayload,
            broadcastPayload,
            winnerBroadcastPayload: transitionResult?.winnerBroadcastPayload,
            roundEnded: transitionResult !== null,
            nextRoundPromise: transitionResult?.nextRoundPromise ?? undefined,
            gameFullyEnded: transitionResult?.gameFullyEnded ?? false,
            gameFullyEndedPromise: transitionResult?.gameFullyEndedPromise,
            leaderboard: transitionResult?.leaderboard
        };
    }

    protected pickNextWord(): string {
        const unused = this.wordlistWords.filter(w => !this.usedWords.has(w.toLowerCase()));
        if (unused.length === 0) {
            this.usedWords.clear();
            return this.wordlistWords[Math.floor(Math.random() * this.wordlistWords.length)] || "hangman";
        }
        return unused[Math.floor(Math.random() * unused.length)]!;
    }

    async triggerRoundTransitionIfNeeded(
        gameId: string,
        roundId: string,
        dbInstance: any,
        checkSocketConnected: (userId: string) => boolean
    ): Promise<RoundTransitionResult | null> {
        if (this._gameEnded || this.completedPlayersCount < this.totalPlayersCount) {
            return null;
        }
        // Guard against the same round being transitioned twice (e.g. a finishing move
        // racing with another player's disconnect).
        if (this._transitioning || roundId !== this.currentRoundId) {
            return null;
        }
        this._transitioning = true;

        await (this._pendingDbOps || Promise.resolve());

        this.enqueueDbOp(() => dbInstance.finishGameRound(roundId));

        const winnerBroadcastPayload = this.buildWinnerPayload();

        if (this.roundIndex >= this.numberOfWords) {
            this._gameEnded = true;
            const gameFullyEndedPromise = this.enqueueDbOp(async () => {
                await dbInstance.finishGame(gameId);

                await Promise.all(this.gamePlayerIds.map(async pid => {
                    const result = this.getFinalResult(pid);
                    await dbInstance.updateGamePlayerResult(gameId, pid, result);
                }));
            });

            const leaderboard = this.buildLeaderboard(this.gamePlayerIds, this.players, this.playerProfiles);
            return {
                winnerBroadcastPayload,
                gameFullyEnded: true,
                gameFullyEndedPromise,
                leaderboard
            };
        }

        const setupNextRound = async () => {
            try {
                const activeUserIds = this.gamePlayerIds.filter(pid => {
                    if (this.players[pid]?.disconnected) return false;
                    return checkSocketConnected(pid);
                });
                if (activeUserIds.length === 0) {
                    await dbInstance.abandonGameAndRound(gameId, roundId);
                    return null;
                }

                const newWord = this.pickNextWord();
                this.usedWords.add(newWord.toLowerCase());

                const newRoundId = crypto.randomUUID();
                this.roundIndex++;
                this.resetRound(newWord);
                this.currentRoundId = newRoundId;
                this.totalPlayersCount = activeUserIds.length;

                await this.enqueueDbOp(async () => {
                    await dbInstance.insertNewRound(gameId, this.roundIndex, newWord, newRoundId);
                    await Promise.all(activeUserIds.map(uid => dbInstance.insertGameRoundPlayer(newRoundId, uid)));
                });

                return {
                    id: newRoundId,
                    maskedWord: this.getMaskedWord(undefined),
                    startTime: Date.now(),
                    lives: this.lives,
                    gamePlayerIds: this.gamePlayerIds
                };
            } finally {
                this._transitioning = false;
            }
        };

        return {
            winnerBroadcastPayload,
            nextRoundPromise: setupNextRound()
        };
    }

    async onPlayerLeave(
        roundId: string,
        gameId: string,
        userId: string,
        dbInstance: any,
        checkSocketConnected: (uid: string) => boolean
    ): Promise<{ gameAbandoned: boolean, transitionResult: RoundTransitionResult | null }> {
        await dbInstance.markPlayerAsDisconnectedByRound(roundId, userId).catch(console.error);

        this.onPlayerDisconnected(userId);

        if (this.totalPlayersCount <= 0) {
            return { gameAbandoned: true, transitionResult: null };
        }

        if (!this.startedAt) {
            return { gameAbandoned: false, transitionResult: null };
        }

        const transitionResult = await this.triggerRoundTransitionIfNeeded(gameId, roundId, dbInstance, checkSocketConnected);
        return { gameAbandoned: false, transitionResult };
    }

    public onPlayerDisconnected(userId: string) {
        // Players are created lazily, so someone who never guessed this round has no entry yet.
        // They still count towards totalPlayersCount, so create one to keep the counters right.
        const player = this.ensurePlayer(userId);
        if (!player.disconnected) {
            player.disconnected = true;
            this.totalPlayersCount = Math.max(0, this.totalPlayersCount - 1);
            if (player.completed) {
                this.completedPlayersCount = Math.max(0, this.completedPlayersCount - 1);
            }
        }
    }
}
