import type { Socket } from "socket.io";
import { activeGameInstances } from "../../game/core/registry.js";

/**
 * Handles the "game:start_next_round" socket event.
 * 
 * Sent by a client once it is ready to play the round announced by "game:new_round_ready".
 * Retrieves the game instance and delegates to the mode's handleStartNextRound method.
 */
export const nextRoundHandler = async (socket: Socket) => {
    const currentGameId = socket.data.user.currentGameId;

    if (!currentGameId) {
        socket.emit("game:started_round", { success: false, error: "Not in a game." });
        return;
    }

    const gameMode = activeGameInstances[currentGameId];
    if (!gameMode) {
        socket.emit("game:started_round", { success: false, error: "Game not started or session lost." });
        return;
    }

    await gameMode.handleStartNextRound(socket);
};
