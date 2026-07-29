import type { Socket } from "socket.io";
import { activeGameInstances } from "../core/registry.js";

/**
 * Handles the "game:start" socket event.
 * 
 * Verifies the user is in a game, then delegates to the specific GameMode's handleStart method
 * which checks for host privileges, player counts, and initializes the first round.
 */
export const startHandler = async (socket: Socket) => {
    const { currentGameId } = socket.data.user;
    if (!currentGameId) {
        socket.emit("game:start", { success: false, error: "Not in a game" });
        return;
    }
    const gameMode = activeGameInstances[currentGameId];
    if (gameMode) {
        await gameMode.handleStart(socket);
    } else {
        socket.emit("game:start", { success: false, error: "Game session lost" });
    }
};
