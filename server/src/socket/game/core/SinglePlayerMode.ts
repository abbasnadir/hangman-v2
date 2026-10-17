import { CoreGameMode } from "./CoreGameMode.js";
import type { Player } from "./Player.js";

export abstract class SinglePlayerMode extends CoreGameMode {
    satisfies(players_count: number): boolean {
        return players_count === 1;
    }

    getPlayerScore(_userId: string): number { 
        return 0; 
    }
    
    getScoresSnapshot(): Record<string, number> { 
        return {}; 
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
            score: 0,
            totalTimeMs: players[pid]?.finalTime || 0,
            result: this.getFinalResult(pid),
        })).sort((a, b) => (players[a.userId]?.finalTime || 0) - (players[b.userId]?.finalTime || 0));
    }
}
