import type { Socket } from "socket.io";
import * as dbQueries from "../../shared/utils/dbQueries.js";
import { activeGameInstances } from "../game/core/registry.js";

export default async function disconnect(socket: Socket, reason: string) {
  if (!socket.data.user) return;
  const { currentRoundId, currentGameId, id: userId } = socket.data.user;
  if (!currentGameId || !currentRoundId) return;

  try {
    const gameMode = activeGameInstances[currentGameId];
    if (gameMode) {
      await gameMode.handleDisconnect(socket, reason);
    } else {
      await dbQueries.markPlayerAsDisconnectedByRound(currentRoundId, userId);
      const remaining_players = await dbQueries.getActivePlayersCount(currentRoundId);
      if (remaining_players === 0) {
        await dbQueries.abandonGameAndRound(currentGameId, currentRoundId);
      }
      socket.to(currentGameId).emit("game:player_disconnected", { userId, reason, username: socket.data.user?.username });
    }
  } catch (error) {
    console.error("Error during disconnect logic:", error);
  }
}
