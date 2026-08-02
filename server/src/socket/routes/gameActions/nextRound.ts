import type { Socket } from "socket.io";
import { activeGameInstances } from "../../game/core/registry.js";
import { Player } from "../../game/core/Player.js";

/**
 * Handles the "game:start_next_round" socket event.
 * 
 * This is primarily used in Classic mode (or when host manually triggers the next round).
 * Retrieves the game instance and delegates to the mode's handleStartNextRound method.
 */
export const nextRoundHandler = async (socket: Socket) => {
    const userId = socket.data.user.id;
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

    if (!gameMode.players[userId]) {
        gameMode.players[userId] = new Player(userId, gameMode.lives);
        if ('scores' in gameMode && (gameMode as any).scores[userId] === undefined) {
            (gameMode as any).scores[userId] = 0;
        }
    }

    // Patch socket.data with the latest round info to prevent disconnect bugs
    if ((gameMode as any).currentRoundId) {
        socket.data.user.currentRoundId = (gameMode as any).currentRoundId;
    }

    const player = gameMode.players[userId];
    const now = Date.now();
    player.startRound(now);
    socket.emit("game:started_round", { success: true, startTime: now, lives: gameMode.lives });
};
