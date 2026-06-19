import {
  getActivePlayersCount,
  markPlayerAsDisconnected,
  abandonGameAndRound,
} from "../../shared/utils/dbQueries.js";
import { activeGameInstances } from "../routes/game.js";
import type { Socket } from "socket.io";

export default async function disconnect(socket: Socket, reason: string) {
  if (!socket.data.user || !socket.data.user.currentRoundPlayerId) {
    return;
  }

  const { currentRoundId, currentGameId, currentRoundPlayerId, id: userId } = socket.data.user;

  try {
    // Mark the player as disconnected first, then check remaining count
    await markPlayerAsDisconnected(currentRoundPlayerId);

    const remaining_players = await getActivePlayersCount(currentRoundId);

    if (remaining_players === 0) {
      await abandonGameAndRound(currentGameId, currentRoundId);
      delete activeGameInstances[currentGameId];
      return;
    }
  } catch (error) {
    console.error("Error during disconnect logic:", error);
  }

  if (currentGameId) {
    socket.to(currentGameId).emit("game:player_disconnected", {
      userId,
      reason,
    });
  }
}
