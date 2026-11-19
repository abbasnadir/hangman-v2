import { CoreGameMode } from "./CoreGameMode.js";
import type { Player } from "./Player.js";

export abstract class SinglePlayerMode extends CoreGameMode {
    /** Rounds won per player across the whole game (players are reset every round). */
    protected roundsWon: Record<string, number> = {};
    protected roundsPlayed: Record<string, number> = {};

    satisfies(players_count: number): boolean {
        return players_count === 1;
    }

    evaluatePlayerResult(userId: string, isSolved: boolean): "won" | "lost" | "completed" | "in_progress" {
        this.roundsPlayed[userId] = (this.roundsPlayed[userId] || 0) + 1;
        if (isSolved) {
            this.roundsWon[userId] = (this.roundsWon[userId] || 0) + 1;
            return "won";
        }
        return "lost";
    }

    resetRound(word: string): void {
        this.word = word;
        this.players = {};
        this.completedPlayersCount = 0;
    }

    /** The game is won when more than half of the rounds were won. */
    getFinalResult(userId: string): string {
        const won = this.roundsWon[userId] || 0;
        const played = Math.max(this.roundsPlayed[userId] || 0, this.roundIndex, 1);
        return won * 2 > played ? "won" : "lost";
    }

    getPlayerScore(userId: string): number { 
        return this.roundsWon[userId] || 0;
    }
    
    getScoresSnapshot(): Record<string, number> { 
        return { ...this.roundsWon };
    }
    
    async fetchLobbyPlayers(): Promise<any[]> { 
        return []; 
    }
    
    shouldBroadcastPlayerEvents(): boolean { 
        return false; 
    }
    
    buildWinnerPayload(): any { 
        return null; 
    }
    
    buildLeaderboard(gamePlayerIds: string[], players: Record<string, Player>, playerProfiles: Record<string, { username: string; pfp: string }>): any[] {
        return gamePlayerIds.map(pid => ({
            userId: pid,
            username: playerProfiles[pid]?.username || "Unknown",
            pfp: playerProfiles[pid]?.pfp || "",
            score: this.getPlayerScore(pid),
            totalTimeMs: players[pid]?.finalTime || 0,
            result: this.getFinalResult(pid),
        })).sort((a, b) => (players[a.userId]?.finalTime || 0) - (players[b.userId]?.finalTime || 0));
    }
}
