import type { Namespace, Socket } from "socket.io";
import { SinglePlayerMode } from "../../core/SinglePlayerMode.js";
import type { Player } from "../../core/Player.js";
import type { ProcessMoveResult, TimerPayload } from "../../../types/gameCore.js";
import type { GameInfo, move } from "../../../../shared/types/GameInfo.js";

/** Base time on the clock for every word. */
export const COUNTDOWN_ROUND_TIME_MS = 60_000;
/** Time knocked off the clock for each wrong guess. */
export const COUNTDOWN_WRONG_GUESS_PENALTY_MS = 6_000;

/**
 * Countdown ("reverse") mode.
 *
 * Instead of a stopwatch counting up and lives being lost, each word starts with a
 * fixed amount of time that counts down. Wrong guesses don't cost a life, they burn
 * time off the clock. Reach zero before the word is solved and the round is lost.
 *
 * The server is authoritative: the deadline is derived from when the player started
 * the round and how many wrong guesses they made, and a server-side timer ends the
 * round even if the client never sends another move.
 */
export class InverseSinglePlayer extends SinglePlayerMode {
    private timers: Record<string, NodeJS.Timeout> = {};
    private nsp: Namespace | null = null;
    private gameId: string | null = null;

    constructor(
        lives: number = 5,
        public readonly timeLimitMs: number = COUNTDOWN_ROUND_TIME_MS,
        public readonly penaltyMs: number = COUNTDOWN_WRONG_GUESS_PENALTY_MS
    ) {
        super("InverseSinglePlayer", 1, 1, lives);
    }

    // ── Clock ───────────────────────────────────────────────────────────────

    private getDeadline(player: Player): number {
        const start = player.startedAt || this.startedAt;
        return start + this.timeLimitMs - player.wrongGuesses * this.penaltyMs;
    }

    private getRemainingMs(player: Player): number {
        if (player.completed) {
            return Math.max(0, this.timeLimitMs - player.finalTime - player.wrongGuesses * this.penaltyMs);
        }
        return Math.max(0, this.getDeadline(player) - Date.now());
    }

    public getTimerPayload(userId: string): TimerPayload {
        const player = this.players[userId];
        return {
            timeLimitMs: this.timeLimitMs,
            penaltyMs: this.penaltyMs,
            remainingMs: player && this.startedAt ? this.getRemainingMs(player) : this.timeLimitMs,
        };
    }

    // ── Rule hooks ──────────────────────────────────────────────────────────

    protected wrongGuessCostsLife(): boolean {
        return false;
    }

    protected hasPlayerFailed(player: Player): boolean {
        return Date.now() >= this.getDeadline(player);
    }

    public processMove(userId: string, move: move, gameState: Partial<GameInfo>): ProcessMoveResult {
        const result = super.processMove(userId, move, gameState);
        // A wrong guess moves the deadline closer, so re-arm the timer (or stop it if done).
        if (result.player.completed) {
            this.clearTimer(userId);
        } else if (this.nsp && this.gameId) {
            this.armTimer(userId);
        }
        return result;
    }

    protected onPlayerRoundActive(socket: Socket, userId: string): void {
        this.nsp = socket.nsp;
        this.gameId = socket.data.user.currentGameId ?? this.gameId;
        this.armTimer(userId);
    }

    resetRound(word: string): void {
        this.clearAllTimers();
        super.resetRound(word);
    }

    public dispose(): void {
        this.clearAllTimers();
        super.dispose();
    }

    // ── Timers ──────────────────────────────────────────────────────────────

    private armTimer(userId: string) {
        this.clearTimer(userId);
        const player = this.players[userId];
        if (!player || player.completed || !this.startedAt) return;

        const roundId = this.currentRoundId;
        // +50ms so the deadline has definitely passed when hasPlayerFailed() is evaluated.
        const delay = this.getRemainingMs(player) + 50;
        this.timers[userId] = setTimeout(() => {
            delete this.timers[userId];
            void this.onTimeUp(userId, roundId);
        }, delay);
    }

    private async onTimeUp(userId: string, roundId: string) {
        if (roundId !== this.currentRoundId || !this.nsp || !this.gameId) return;
        const player = this.players[userId];
        if (!player || player.completed) return;

        if (!this.hasPlayerFailed(player)) {
            this.armTimer(userId);
            return;
        }

        const socket = this.findPlayerSocket(userId);
        // If the player is offline the round is settled when they rejoin (the clock keeps
        // running while away) or the game is abandoned by the disconnect handler.
        if (!socket) return;

        try {
            await this.forceFailPlayer(socket);
        } catch (err) {
            console.error("Countdown timeout handling failed:", err);
        }
    }

    private findPlayerSocket(userId: string): Socket | null {
        if (!this.nsp) return null;
        for (const [, s] of this.nsp.sockets) {
            if (s.data.user?.id === userId && s.data.user?.currentGameId === this.gameId) return s;
        }
        return null;
    }

    private clearTimer(userId: string) {
        const timer = this.timers[userId];
        if (timer) {
            clearTimeout(timer);
            delete this.timers[userId];
        }
    }

    private clearAllTimers() {
        for (const userId of Object.keys(this.timers)) this.clearTimer(userId);
    }
}
