import type { Socket } from "socket.io";
import { z } from "zod";
import { submitMovePayloadSchema } from "../../schemas/gameProcessSchema.js";
import * as db from "../../../shared/utils/dbQueries.js";
import { activeGameInstances } from "../core/registry.js";
import type { GameInfo, move } from "../../../shared/types/GameInfo.js";
import { Player } from "./Player.js";

import type {
    ProcessMoveResult,
    PlayerFinishedResult,
    MoveSubmittedResult,
    PlayerLeaveResult
} from "../../types/gameCore.js";

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

    /**
     * Helper to cleanly enqueue an asynchronous DB operation so it runs after
     * all previously pending DB operations have completed. This prevents
     * race conditions like inserting a move before the round is inserted.
     */
    public enqueueDbOp<T>(op: () => Promise<T>): Promise<T> {
        const previous = this._pendingDbOps || Promise.resolve();
        const next = previous.then(() => op()).catch(err => {
            console.error("Background DB Op Error:", err);
            // Catch error so subsequent operations don't get blocked
        });
        this._pendingDbOps = next;
        return next as Promise<T>;
    }
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
    async initialize(config: GameInitConfig, db: any): Promise<{ maskedWord: string[]; startTime: number }> {
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
    abstract onMoveSubmitted(
        userId: string,
        move: move,
        gameId: string,
        roundId: string,
        db: any,
        checkSocketConnected: () => boolean,
        username?: string,
        pfp?: string
    ): MoveSubmittedResult;

    /**
     * Handle a player leaving the game. Cleans up DB state and determines
     * whether the entire game should be abandoned.
     */
    async onPlayerLeave(
        roundId: string,
        gameId: string,
        userId: string,
        db: any,
        checkSocketConnected: () => boolean
    ): Promise<PlayerLeaveResult & { transitionResult?: Omit<PlayerFinishedResult, 'playerEvent' | 'broadcastPayload'> | null }> {
        // Fire-and-forget DB update
        db.markPlayerAsDisconnectedByRound(roundId, userId).catch(console.error);
        
        this.onPlayerDisconnected(userId);
        
        if (this.totalPlayersCount === 0) {
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
        if (this.players[userId]) {
            (this.players[userId] as any).disconnected = true;
        }
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
    abstract onPlayerFinished(
        userId: string,
        playerResult: "won" | "lost" | "completed",
        gameId: string,
        roundId: string,
        db: any,
        checkSocketConnected: () => boolean,
        cachedUsername?: string,
        cachedPfp?: string
    ): Promise<PlayerFinishedResult>;

    abstract triggerRoundTransitionIfNeeded(
        gameId: string,
        roundId: string,
        db: any,
        checkSocketConnected: () => boolean,
        dbPromises?: Promise<any>[]
    ): Promise<Omit<PlayerFinishedResult, 'playerEvent' | 'broadcastPayload'> | null>;

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

    // ── Route Handlers ────────────────────────────────────────────────────────
    
    abstract handleStart(socket: import("socket.io").Socket, payload?: unknown): Promise<void>;
    abstract handleSubmitMove(socket: import("socket.io").Socket, payload: unknown): Promise<void>;
    abstract handleDisconnect(socket: import("socket.io").Socket, reason: string): Promise<void>;
    abstract handleLeave(socket: import("socket.io").Socket): Promise<void>;
    abstract handleJoin(socket: import("socket.io").Socket, gameId: string, userId: string, dbData: any): Promise<void>;
}
