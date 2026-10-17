import type { Socket } from "socket.io";
import { z } from "zod";
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
    PlayerLeaveResult
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

    public processMove(userId: string, move: move, _gameState: Partial<GameInfo>): ProcessMoveResult {
        if (!this.players[userId]) {
            this.players[userId] = new Player(userId, this.lives);
            if ('scores' in this && (this as any).scores[userId] === undefined) {
                (this as any).scores[userId] = 0;
            }
        }

        const player = this.players[userId];
        const isRoundEnded = this.completedPlayersCount >= this.totalPlayersCount;

        if (player.completed) {
            return {
                player,
                processedMove: null,
                playerResult: "in_progress",
                roundEnded: isRoundEnded,
                hasNextRound: this.roundIndex < this.numberOfWords
            };
        }

        const guess = move.guess.toLowerCase();

        if (player.move_set.includes(guess)) {
            return {
                player,
                processedMove: null,
                playerResult: "in_progress",
                roundEnded: isRoundEnded,
                hasNextRound: this.roundIndex < this.numberOfWords
            };
        }

        const isLibMatch = this.word.includes(guess);
        player.recordGuess(guess, isLibMatch, this.startedAt);

        const currentMasked = this.getMaskedWord(userId).join("");
        const isSolved = !currentMasked.includes("_");

        let playerResult: "won" | "lost" | "in_progress" | "completed" = "in_progress";

        if (isSolved || player.lives <= 0) {
            player.finish(this.startedAt);
            this.completedPlayersCount++;
            playerResult = this.evaluatePlayerResult(userId, isSolved);
        }

        const processedMove = { guess, correct: isLibMatch, timestamp: move.timestamp, move_index: player.move_index };

        return {
            player,
            processedMove,
            playerResult,
            roundEnded: this.completedPlayersCount >= this.totalPlayersCount,
            hasNextRound: this.roundIndex < this.numberOfWords
        };
    }

    // ── Virtual Hooks (Overridden by SinglePlayerMode / MultiplayerMode) ───

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
        return this.word.split("").map(char => (char === " " ? " " : guessedLetters.includes(char.toLowerCase()) ? char : "_"));
    }

    // ── Action Methods ──────────────────────────────────────────────────────

    async handleJoin(socket: Socket, gameId: string, userId: string, dbData: any) {
        const { gameStatus, existingPlayer, activeRounds } = dbData;
        const isHost = gameStatus.created_by === userId;
        const modeId = gameStatus.mode_id;

        if (existingPlayer) {
            socket.join(gameId);
            if (activeRounds && activeRounds.length > 0) {
                const round = activeRounds[0];
                const roundPlayer = await db.getRoundPlayer(round.id, userId).catch(() => null);
                if (roundPlayer) await db.markPlayerAsActive(roundPlayer.id).catch(console.error);

                socket.data.user.currentGameId = gameId;
                socket.data.user.currentRoundId = round.id;
                socket.data.user.currentRoundPlayerId = roundPlayer?.id ?? null;
            }

            if (!activeGameInstances[gameId]) {
                const [roundInfo, wordlistResult, gamePlayersData, usedRoundWords] = await Promise.all([
                    db.fetchRoundInfo(socket.data.user.currentRoundId),
                    db.getWordlistWords(gameStatus.wordlist_id).then(words => ({ data: { words } })),
                    db.getGamePlayers(gameId).then(data => ({ data })),
                    db.getUsedWordsInGame(gameId).then(data => ({ data })),
                ]);
                if (!roundInfo.error && roundInfo.data) {
                    this.word = roundInfo.data.word;
                    this.roundIndex = roundInfo.data.round_index;
                    if (roundInfo.data.started_at) {
                        this.startedAt = new Date(roundInfo.data.started_at).getTime();
                    }
                }
                this.wordlistWords = wordlistResult.data?.words ?? [];
                this.gamePlayerIds = (gamePlayersData.data ?? []).map((gp: any) => gp.user_id);
                this.usedWords = usedRoundWords.data ?? new Set<string>();
                
                const count = await db.getActivePlayersCount(socket.data.user.currentRoundId);
                this.totalPlayersCount = count;
                this.currentRoundId = socket.data.user.currentRoundId;
                activeGameInstances[gameId] = this;
            }

            let started = false;
            let maskedWord: string[] | undefined = undefined;
            let startTime: number | undefined = undefined;
            let lives = gameStatus.total_lives;
            let move_set: string[] = [];
            let playersCount = socket.data.user.currentRoundId 
                ? await db.getActivePlayersCount(socket.data.user.currentRoundId) 
                : (this.totalPlayersCount || 0);
            
            if (this.startedAt && gameStatus.status === 'in_progress') {
                if (this.abandonTimer) {
                    clearTimeout(this.abandonTimer);
                    delete this.abandonTimer;
                }

                if (!this.players[userId]) {
                    socket.emit("game:join", { success: false, error: "You abandoned this game and cannot rejoin." });
                    return;
                }

                if ((this.players[userId] as any).disconnected) {
                    this.totalPlayersCount++;
                    if (this.players[userId].completed) {
                        this.completedPlayersCount++;
                    }
                    (this.players[userId] as any).disconnected = false;
                }

                started = true;
                startTime = this.startedAt;
                lives = this.players[userId].lives;
                move_set = this.players[userId].move_set;
                maskedWord = this.getMaskedWord(userId);
                playersCount = this.totalPlayersCount;
            }

            const existingPlayers = socket.data.user.currentRoundId ? await this.fetchLobbyPlayers(socket.data.user.currentRoundId, gameId, gameStatus.total_lives) : [];

            socket.emit("game:join", { 
                success: true, gameId, userId, reconnected: true, isHost, modeId, playersCount, started, maskedWord, startTime, lives, move_set, username: socket.data.user.username, existingPlayers, totalLives: gameStatus.total_lives
            });
            
            if (this.shouldBroadcastPlayerEvents()) {
                socket.to(gameId).emit("game:player_joined", { userId, playersCount, username: socket.data.user.username });
            }
            return;
        }

        if (!activeRounds || activeRounds.length === 0) {
            socket.emit("game:join", { success: false, error: "No active round available to join." });
            return;
        }
        const roundToJoin = activeRounds[0];

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

        const [playersCount, existingPlayers] = await Promise.all([
            db.getActivePlayersCount(roundToJoin.id),
            this.fetchLobbyPlayers(roundToJoin.id, gameId, gameStatus.total_lives)
        ]); 

        if (!activeGameInstances[gameId]) {
            const [roundInfo, wordlistResult, gamePlayersData, usedRoundWords] = await Promise.all([
                db.fetchRoundInfo(socket.data.user.currentRoundId),
                db.getWordlistWords(gameStatus.wordlist_id).then(words => ({ data: { words } })),
                db.getGamePlayers(gameId).then(data => ({ data })),
                db.getUsedWordsInGame(gameId).then(data => ({ data })),
            ]);
            if (!roundInfo.error && roundInfo.data) {
                this.word = roundInfo.data.word;
                this.roundIndex = roundInfo.data.round_index;
                if (roundInfo.data.started_at) {
                    this.startedAt = new Date(roundInfo.data.started_at).getTime();
                }
            }
            this.wordlistWords = wordlistResult.data?.words ?? [];
            this.gamePlayerIds = (gamePlayersData.data ?? []).map((gp: any) => gp.user_id);
            this.usedWords = usedRoundWords.data ?? new Set<string>();
            
            this.currentRoundId = socket.data.user.currentRoundId;
            activeGameInstances[gameId] = this;
        }

        this.totalPlayersCount = playersCount;
        if (!this.gamePlayerIds.includes(userId)) {
            this.gamePlayerIds.push(userId);
        }

        socket.emit("game:join", { success: true, gameId, userId, reconnected: false, isHost, modeId, playersCount, username: socket.data.user.username, existingPlayers, totalLives: gameStatus.total_lives });
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

        const startPayload = {
            success: true,
            maskedWord: this.getMaskedWord(userId),
            lives: this.lives,
            startTime
        };
        socket.emit("game:start", startPayload);
        socket.to(gameId).emit("game:start", startPayload);
    }

    async handleSubmitMove(socket: Socket, payload: any) {
        const parsed = submitMovePayloadSchema.safeParse(payload);
        if (!parsed.success) {
            socket.emit("game:submit_move", { success: false, error: "Invalid payload format." });
            return;
        }
        const { guess, timestamp } = parsed.data;
        const userId = socket.data.user.id;
        const gameId = socket.data.user.currentGameId;
        const roundId = socket.data.user.currentRoundId;
        const username = socket.data.user.username;
        const pfp = socket.data.user.pfp;

        const checkSocketConnected = (uid: string) => {
            const s = socket.nsp.sockets;
            for (const [_, clientSocket] of s) {
                if (clientSocket.data.user?.id === uid) return true;
            }
            return false;
        };

        const { moveResponse, finishPromise } = this.onMoveSubmitted(
            userId, 
            { guess, timestamp: new Date(timestamp) },
            gameId,
            roundId,
            db,
            checkSocketConnected,
            username,
            pfp
        );

        socket.emit("game:submit_move", moveResponse);

        if (finishPromise) {
            const finishResult = await finishPromise;
            
            if (finishResult) {
                socket.emit(finishResult.playerEvent, finishResult.playerPayload);
                socket.to(gameId).emit("game:player_finished_broadcast", finishResult.broadcastPayload);

                if (finishResult.winnerBroadcastPayload) {
                    socket.emit("game:player_finished_broadcast", finishResult.winnerBroadcastPayload);
                    socket.to(gameId).emit("game:player_finished_broadcast", finishResult.winnerBroadcastPayload);
                }

                if (finishResult.nextRoundPromise) {
                    const nextRoundData = await finishResult.nextRoundPromise;
                    
                    if (nextRoundData) {
                        const s = socket.nsp.sockets;
                        for (const [_, clientSocket] of s) {
                            if (clientSocket.data.user?.currentGameId === gameId) {
                                clientSocket.data.user.currentRoundId = nextRoundData.id;
                            }
                        }
                        
                        socket.emit("game:new_round_ready", nextRoundData);
                        socket.to(gameId).emit("game:new_round_ready", nextRoundData);
                    }
                } else if (finishResult.gameFullyEndedPromise) {
                    await finishResult.gameFullyEndedPromise;
                    const endPayload = { 
                        result: "game_ended", 
                        leaderboard: finishResult.leaderboard,
                        finalScores: this.getScoresSnapshot()
                    };
                    socket.emit("game:fully_completed", endPayload);
                    socket.to(gameId).emit("game:fully_completed", endPayload);
                    
                    delete activeGameInstances[gameId];
                }
            }
        }
    }

    async handleLeave(socket: Socket) {
        const userId = socket.data.user.id;
        const gameId = socket.data.user.currentGameId;
        const roundId = socket.data.user.currentRoundId;

        const checkSocketConnected = (uid: string) => {
            const s = socket.nsp.sockets;
            for (const [_, clientSocket] of s) {
                if (clientSocket.data.user?.id === uid) return true;
            }
            return false;
        };

        const { gameAbandoned, transitionResult } = await this.onPlayerLeave(
            roundId, gameId, userId, db, checkSocketConnected
        );

        if (gameAbandoned) {
            this.abandonTimer = setTimeout(async () => {
                delete activeGameInstances[gameId];
                socket.to(gameId).emit("game:abandoned");
                await db.abandonGameAndRound(gameId, roundId).catch(console.error);
            }, 10000);
        }

        if (transitionResult) {
            if (transitionResult.winnerBroadcastPayload) {
                socket.to(gameId).emit("game:player_finished_broadcast", transitionResult.winnerBroadcastPayload);
            }
            if (transitionResult.nextRoundPromise) {
                const nextRoundData = await transitionResult.nextRoundPromise;
                const s = socket.nsp.sockets;
                for (const [_, clientSocket] of s) {
                    if (clientSocket.data.user?.currentGameId === gameId) {
                        clientSocket.data.user.currentRoundId = nextRoundData.id;
                    }
                }
                socket.to(gameId).emit("game:new_round_ready", nextRoundData);
            } else if (transitionResult.gameFullyEndedPromise) {
                await transitionResult.gameFullyEndedPromise;
                socket.to(gameId).emit("game:fully_completed", { 
                    result: "game_ended", 
                    leaderboard: transitionResult.leaderboard,
                    finalScores: this.getScoresSnapshot()
                });
                delete activeGameInstances[gameId];
            }
        }

        delete socket.data.user.currentGameId;
        delete socket.data.user.currentRoundId;
        delete socket.data.user.currentRoundPlayerId;

        socket.leave(gameId);
        socket.emit("game:leave", { success: true });
        
        if (this.shouldBroadcastPlayerEvents()) {
            socket.to(gameId).emit("game:player_left", { userId, playersCount: this.totalPlayersCount });
        }
    }

    async handleDisconnect(socket: Socket, reason: string) {
        const userId = socket.data.user.id;
        const gameId = socket.data.user.currentGameId;
        const roundId = socket.data.user.currentRoundId;

        const s = socket.nsp.sockets;
        let otherSocketConnected = false;
        for (const [id, clientSocket] of s) {
            if (id !== socket.id && clientSocket.data.user?.id === userId && clientSocket.data.user?.currentGameId === gameId) {
                otherSocketConnected = true;
                break;
            }
        }
        if (otherSocketConnected) return;

        const checkSocketConnected = (uid: string) => {
            for (const [_, clientSocket] of s) {
                if (clientSocket.data.user?.id === uid) return true;
            }
            return false;
        };

        const { gameAbandoned, transitionResult } = await this.onPlayerLeave(
            roundId, gameId, userId, db, checkSocketConnected
        );

        if (gameAbandoned) {
            this.abandonTimer = setTimeout(async () => {
                delete activeGameInstances[gameId];
                socket.to(gameId).emit("game:abandoned");
                await db.abandonGameAndRound(gameId, roundId).catch(console.error);
            }, 10000);
        }

        if (transitionResult) {
            if (transitionResult.winnerBroadcastPayload) {
                socket.to(gameId).emit("game:player_finished_broadcast", transitionResult.winnerBroadcastPayload);
            }
            if (transitionResult.nextRoundPromise) {
                const nextRoundData = await transitionResult.nextRoundPromise;
                for (const [_, clientSocket] of s) {
                    if (clientSocket.data.user?.currentGameId === gameId) {
                        clientSocket.data.user.currentRoundId = nextRoundData.id;
                    }
                }
                socket.to(gameId).emit("game:new_round_ready", nextRoundData);
            } else if (transitionResult.gameFullyEndedPromise) {
                await transitionResult.gameFullyEndedPromise;
                socket.to(gameId).emit("game:fully_completed", { 
                    result: "game_ended", 
                    leaderboard: transitionResult.leaderboard,
                    finalScores: this.getScoresSnapshot()
                });
                delete activeGameInstances[gameId];
            }
        }

        if (this.shouldBroadcastPlayerEvents()) {
            socket.to(gameId).emit("game:player_disconnected", { userId, playersCount: this.totalPlayersCount });
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

        this.enqueueDbOp(() => dbInstance.insertMove(userId, roundId, move.guess, move.timestamp.toISOString()));

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
            move_set: player.move_set
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
            nextRoundPromise: transitionResult?.nextRoundPromise,
            gameFullyEnded: transitionResult?.gameFullyEnded ?? false,
            gameFullyEndedPromise: transitionResult?.gameFullyEndedPromise,
            leaderboard: transitionResult?.leaderboard
        };
    }

    async triggerRoundTransitionIfNeeded(
        gameId: string,
        roundId: string,
        dbInstance: any,
        checkSocketConnected: (userId: string) => boolean
    ): Promise<any | null> {
        if (this.completedPlayersCount < this.totalPlayersCount) {
            return null;
        }

        await (this._pendingDbOps || Promise.resolve());

        this.enqueueDbOp(() => dbInstance.finishGameRound(roundId));

        const winnerBroadcastPayload = this.buildWinnerPayload();

        if (this.roundIndex >= this.numberOfWords) {
            const gameFullyEndedPromise = this.enqueueDbOp(async () => {
                const endedAt = new Date().toISOString();
                await dbInstance.finishGame(gameId, endedAt);
                
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

        if (this._transitioning) {
            return { winnerBroadcastPayload, nextRoundPromise: null };
        }
        this._transitioning = true;

        const setupNextRound = async () => {
            const activeUserIds = this.gamePlayerIds.filter(pid => {
                if (this.players[pid] && (this.players[pid] as any).disconnected) return false;
                return checkSocketConnected(pid);
            });
            if (activeUserIds.length === 0) {
                await dbInstance.abandonGameAndRound(gameId, roundId);
                return null;
            }

            let newWord = this.wordlistWords.find(w => !this.usedWords.has(w));
            if (!newWord) {
                this.usedWords.clear();
                newWord = this.wordlistWords[0] || "error";
            }
            this.usedWords.add(newWord);

            const newRoundId = crypto.randomUUID();
            this.roundIndex++;
            this.resetRound(newWord);

            await this.enqueueDbOp(async () => {
                await dbInstance.insertNewRound(gameId, this.roundIndex, newWord, newRoundId);
                const playerPromises = activeUserIds.map(uid => dbInstance.insertGameRoundPlayer(newRoundId, uid));
                await Promise.all(playerPromises);
            });

            this.currentRoundId = newRoundId;
            this._transitioning = false;

            return {
                id: newRoundId,
                maskedWord: this.getMaskedWord(undefined),
                startTime: Date.now(),
                gamePlayerIds: this.gamePlayerIds
            };
        };

        const nextRoundPromise = setupNextRound();
        return {
            winnerBroadcastPayload,
            nextRoundPromise
        };
    }

    async onPlayerLeave(
        roundId: string,
        gameId: string,
        userId: string,
        dbInstance: any,
        checkSocketConnected: (uid: string) => boolean
    ): Promise<{ gameAbandoned: boolean, transitionResult: any | null }> {
        await dbInstance.markPlayerAsDisconnectedByRound(roundId, userId).catch(console.error);

        this.onPlayerDisconnected(userId);

        if (this.totalPlayersCount === 0) {
            return { gameAbandoned: true, transitionResult: null };
        }

        const transitionResult = await this.triggerRoundTransitionIfNeeded(gameId, roundId, dbInstance, checkSocketConnected);
        return { gameAbandoned: false, transitionResult };
    }

    public onPlayerDisconnected(userId: string) {
        if (this.players[userId]) {
            if (!(this.players[userId] as any).disconnected) {
                (this.players[userId] as any).disconnected = true;
                this.totalPlayersCount--;
                if (this.players[userId].completed) {
                    this.completedPlayersCount--;
                }
            }
        }
    }
}
