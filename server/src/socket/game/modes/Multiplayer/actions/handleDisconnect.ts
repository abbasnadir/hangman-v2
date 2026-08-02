import type { Socket } from "socket.io";
import * as db from "../../../../../shared/utils/dbQueries.js";
import { activeGameInstances } from "../../../core/registry.js";
import type { Multiplayer } from "../index.js";

export async function handleDisconnect(this: Multiplayer, socket: Socket, reason: string) {
        const { currentRoundId, currentGameId, id: userId } = socket.data.user;

        // Check if the user has other sockets still connected to this game
        const gameSockets = await (socket as any).server.in(currentGameId).fetchSockets();
        const otherSockets = gameSockets.filter((s: any) => s.data?.user?.id === userId && s.id !== socket.id);
        if (otherSockets.length > 0) {
            return; // User is still connected via another tab
        }

        const { gameAbandoned, transitionResult } = await this.onPlayerLeave(currentRoundId, currentGameId, userId, db, () => false);
        if (gameAbandoned) {
            this.abandonTimer = setTimeout(async () => {
                delete activeGameInstances[currentGameId];
                socket.to(currentGameId).emit("game:abandoned", { success: true });
                await db.abandonGameAndRound(currentGameId, currentRoundId).catch(console.error);
            }, 10000);
        } else if (transitionResult) {
            if (transitionResult.winnerBroadcastPayload) {
                socket.to(currentGameId).emit("game:player_finished_broadcast", transitionResult.winnerBroadcastPayload);
            }
            if (transitionResult.nextRoundPromise) {
                const nextRoundData = await transitionResult.nextRoundPromise;
                if (nextRoundData) {
                    const newRoundPayload = { maskedWord: nextRoundData.maskedWord, startTime: nextRoundData.startTime };
                    socket.to(currentGameId).emit("game:new_round_ready", newRoundPayload);
                }
            }
            if (transitionResult.gameFullyEnded) {
                const scores = 'scores' in this ? (this as any).scores : {};
                socket.to(currentGameId).emit("game:fully_completed", { success: true, result: "won", finalScores: scores, leaderboard: (transitionResult as any).leaderboard });
                delete activeGameInstances[currentGameId];
            }
        }
        socket.to(currentGameId).emit("game:player_disconnected", { userId, reason, username: socket.data.user?.username });
}
