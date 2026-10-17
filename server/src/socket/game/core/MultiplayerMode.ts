import { CoreGameMode } from "./CoreGameMode.js";
import type { Player } from "./Player.js";
import * as db from "../../../shared/utils/dbQueries.js";
import { activeGameInstances } from "./registry.js";

export abstract class MultiplayerMode extends CoreGameMode {
    shouldBroadcastPlayerEvents(): boolean { 
        return true; 
    }

    async fetchLobbyPlayers(roundId: string, gameId: string, totalLives: number): Promise<any[]> {
        const roundPlayers = await db.getGameRoundPlayers(roundId);
        if (!roundPlayers || roundPlayers.length === 0) return [];
        
        const playerIds = roundPlayers.map((rp: any) => rp.user_id);
        const profiles = await Promise.all(playerIds.map((id: string) => db.getProfile(id)));

        return roundPlayers.map((rp: any) => {
            const p = profiles.find((prof: any) => prof?.id === rp.user_id);
            const playerState = activeGameInstances[gameId]?.players[rp.user_id];
            
            return {
                userId: rp.user_id,
                username: p?.username ?? "Player",
                pfp: p?.pfp ?? "",
                lives: playerState?.lives ?? totalLives,
                completed: playerState?.completed ?? false,
                timeTakenMs: playerState?.getTimeTaken(activeGameInstances[gameId]?.startedAt || 0) ?? 0,
                score: this.getPlayerScore(rp.user_id),
                disconnected: (playerState as any)?.disconnected ?? false,
            };
        });
    }

    abstract getPlayerScore(userId: string): number;
    abstract getScoresSnapshot(): Record<string, number>;
    abstract buildWinnerPayload(): { userId: string; username: string; pfp: string; score: number } | null;
    abstract buildLeaderboard(
        gamePlayerIds: string[],
        players: Record<string, Player>,
        playerProfiles: Record<string, { username: string; pfp: string }>
    ): Array<{ userId: string; username: string; pfp: string; score: number; totalTimeMs: number; result: string }>;
}
