import type { Socket } from "socket.io";
import { activeGameInstances } from "../core/registry.js";

export const leaveHandler = async (socket: Socket) => {
    const { currentGameId } = socket.data.user;
    if (!currentGameId) {
        socket.emit("game:leave", { success: false, error: "Not in a game" });
        return;
    }
    const gameMode = activeGameInstances[currentGameId];
    if (gameMode) {
        await gameMode.handleLeave(socket);
    } else {
        socket.leave(currentGameId);
        socket.data.user.currentGameId = undefined;
        socket.data.user.currentRoundId = undefined;
        socket.data.user.currentRoundPlayerId = undefined;
        socket.emit("game:leave", { success: true });
    }
};
