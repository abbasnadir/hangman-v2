import { MultiplayerMode } from "../../core/MultiplayerMode.js";
import type { Player } from "../../core/Player.js";

export class Multiplayer extends MultiplayerMode {
    winner: string | null = null;
    minTime: number = Infinity;
    scores: Record<string, number> = {};
    private roundScoreAwarded: boolean = false;

    constructor(lives: number = 5) {
        super("Multiplayer", 2, 50, lives);
    }

    satisfies(players_count: number): boolean {
        return players_count >= this.min_players && players_count <= this.max_players;
    }

    evaluatePlayerResult(userId: string, isSolved: boolean): "won" | "lost" | "completed" | "in_progress" {
        const player = this.players[userId];
        if (!player) return "lost";
        const timeTaken = player.finalTime;

        if (isSolved && timeTaken < this.minTime) {
            // Each player's clock starts when they begin the round, so a later finisher can
            // still have the best time. Move the round point to them instead of keeping it
            // with whoever happened to finish first.
            if (this.roundScoreAwarded && this.winner && this.winner !== userId) {
                this.scores[this.winner] = Math.max(0, (this.scores[this.winner] || 0) - 1);
            }
            this.minTime = timeTaken;
            this.winner = userId;
            this.scores[userId] = (this.scores[userId] || 0) + 1;
            this.roundScoreAwarded = true;
            return "won";
        } else {
            return player.lives > 0 ? "completed" : "lost";
        }
    }

    resetRound(word: string): void {
        this.word = word;
        this.winner = null;
        this.minTime = Infinity;
        this.players = {};
        this.completedPlayersCount = 0;
        this.roundScoreAwarded = false;
    }

    getFinalResult(userId: string): string {
        const p = this.players[userId];
        let maxScore = -1;
        for (const pid of this.gamePlayerIds) {
            const s = this.scores[pid] || 0;
            if (s > maxScore) maxScore = s;
        }
        
        // Rounds won decide the game; `p` only reflects the final round.
        if (this.scores[userId] === maxScore && maxScore > 0) return "won";
        if ((this.scores[userId] || 0) > 0) return "completed";
        if (p?.completed && p.lives > 0) return "completed";
        return "lost";
    }

    // ── Forced Multiplayer Hooks ──

    getPlayerScore(userId: string): number {
        return this.scores[userId] || 0;
    }

    getScoresSnapshot(): Record<string, number> {
        return { ...this.scores };
    }

    buildWinnerPayload(): { userId: string; username: string; pfp: string; score: number } | null {
        if (!this.winner) return null;
        return {
            userId: this.winner,
            username: this.playerProfiles[this.winner]?.username || "Unknown",
            pfp: this.playerProfiles[this.winner]?.pfp || "",
            score: this.scores[this.winner] || 0,
        };
    }

    buildLeaderboard(
        gamePlayerIds: string[],
        players: Record<string, Player>,
        playerProfiles: Record<string, { username: string; pfp: string }>
    ) {
        return gamePlayerIds.map(pid => ({
            userId: pid,
            username: playerProfiles[pid]?.username || "Unknown",
            pfp: playerProfiles[pid]?.pfp || "",
            score: this.scores[pid] || 0,
            totalTimeMs: players[pid]?.finalTime || 0,
            result: this.getFinalResult(pid),
        })).sort((a, b) => b.score - a.score || a.totalTimeMs - b.totalTimeMs);
    }
}
