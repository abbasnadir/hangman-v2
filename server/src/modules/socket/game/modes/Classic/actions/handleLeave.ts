import type { Socket } from "socket.io";
import * as db from "../../../../../shared/utils/dbQueries.js";
import { activeGameInstances } from "../../../core/registry.js";
import type { Classic } from "../index.js";

export async function handleLeave(this: Classic, socket: Socket) {
        const { currentRoundId, currentGameId, id: userId } = socket.data.user;
        const { gameAbandoned, transitionResult } = await this.onPlayerLeave(currentRoundId, currentGameId, userId, db, () => socket.connected);
        if (gameAbandoned) {
            this.abandonTimer = setTimeout(async () => {
                delete activeGameInstances[currentGameId];
                socket.to(currentGameId).emit("game:abandoned", { success: true });
                await db.abandonGameAndRound(currentGameId, currentRoundId).catch(console.error);
            }, 10000);
        } else if (transitionResult) {

            if (transitionResult.nextRoundPromise) {
                const nextRoundData = await transitionResult.nextRoundPromise;
                if (nextRoundData) {
                    const newRoundPayload = { maskedWord: nextRoundData.maskedWord, startTime: nextRoundData.startTime };
                    socket.to(currentGameId).emit("game:new_round_ready", newRoundPayload);
                    socket.emit("game:new_round_ready", newRoundPayload);
                }
            }
            if (transitionResult.gameFullyEnded) {
                if (transitionResult.gameFullyEndedPromise) {
                    transitionResult.gameFullyEndedPromise.catch(console.error);
                }
                const scores = {};
                socket.to(currentGameId).emit("game:fully_completed", { success: true, finalScores: scores, result: "won", leaderboard: (transitionResult as any).leaderboard });
                delete activeGameInstances[currentGameId];
            }
        }
        
        socket.leave(currentGameId);
        socket.data.user.currentGameId = undefined;
        socket.data.user.currentRoundId = undefined;
        socket.data.user.currentRoundPlayerId = undefined;
        
        socket.emit("game:leave", { success: true });
        socket.to(currentGameId).emit("game:player_left", { userId, username: socket.data.user.username });
}
