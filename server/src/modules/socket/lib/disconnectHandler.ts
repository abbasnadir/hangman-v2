import * as dbQueries from "../../shared/utils/dbQueries.js";
import { dbAdapter } from "../game/utils/dbAdapter.js";
import { activeGameInstances } from "../game/utils/registry.js";
import type { Socket } from "socket.io";

export default async function disconnect(socket: Socket, reason: string) {
  if (!socket.data.user) {
    return;
  }

  let { currentRoundId, currentGameId, id: userId } = socket.data.user;

  if (!currentGameId || !currentRoundId) {
    return;
  }

  try {
    const gameMode = activeGameInstances[currentGameId];
    if (gameMode && (gameMode as any).currentRoundId) {
        currentRoundId = (gameMode as any).currentRoundId;
    }
    
    if (gameMode) {
      const { gameAbandoned, transitionResult } = await gameMode.onPlayerLeave(currentRoundId, currentGameId, userId, dbAdapter, () => false);
      if (gameAbandoned) {
        delete activeGameInstances[currentGameId];
        socket.to(currentGameId).emit("game:abandoned", { success: true });
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
              const scores: Record<string, number> = 'scores' in gameMode ? (gameMode as any).scores : {};
              socket.to(currentGameId).emit("game:fully_completed", { success: true, result: "won", finalScores: scores, leaderboard: (transitionResult as any).leaderboard });
              delete activeGameInstances[currentGameId];
          }
      }
    } else {
      // Fallback if gameMode doesn't exist (e.g. game crashed but socket remained)
      await dbQueries.markPlayerAsDisconnectedByRound(currentRoundId, userId);
      const remaining_players = await dbQueries.getActivePlayersCount(currentRoundId);
      if (remaining_players === 0) {
        await dbQueries.abandonGameAndRound(currentGameId, currentRoundId);
        socket.to(currentGameId).emit("game:player_disconnected", { userId, reason, username: socket.data.user?.username });
        return;
      }
    }
  } catch (error) {
    console.error("Error during disconnect logic:", error);
  }

  socket.to(currentGameId).emit("game:player_disconnected", { userId, reason, username: socket.data.user?.username });
}
