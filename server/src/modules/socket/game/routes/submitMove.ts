import type { Socket } from "socket.io";
import { activeGameInstances } from "../core/registry.js";

/**
 * Handles the "game:submit_move" socket event.
 * 
 * Simply retrieves the active GameMode from memory and delegates to its handleSubmitMove method,
 * where all the game logic, scoring, and win/loss conditions are processed.
 */
export const submitMoveHandler = async (socket: Socket, payload: unknown) => {
    const currentGameId = socket.data.user.currentGameId;
    if (!currentGameId) {
        socket.emit("game:submit_move", { success: false, error: "You are not in an active game." });
        return;
    }
    const gameMode = activeGameInstances[currentGameId];
    if (!gameMode) {
        socket.emit("game:submit_move", { success: false, error: "Game not started or session lost." });
        return;
    }
    await gameMode.handleSubmitMove(socket, payload);
};
