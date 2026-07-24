import type { Socket } from "socket.io";
import { activeGameInstances } from "../utils/registry.js";
import { Player } from "../core/Player.js";

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
