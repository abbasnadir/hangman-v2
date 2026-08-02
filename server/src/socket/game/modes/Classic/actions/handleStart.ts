import type { Socket } from "socket.io";
import * as db from "../../../../../shared/utils/dbQueries.js";
import type { Classic } from "../index.js";

export async function handleStart(this: Classic, socket: Socket) {
        const userId = socket.data.user.id;
        if (userId !== this.createdBy) { // host check
            socket.emit("game:start", { success: false, error: "Only the host can start the game." });
            return;
        }
        if (this.startedAt) {
            socket.emit("game:start", { success: false, error: "This game has already been started." });
            return;
        }
        if (!this.satisfies(this.totalPlayersCount)) {
            socket.emit("game:start", { success: false, error: `Player count not met. Have ${this.totalPlayersCount}, need ${this.min_players}–${this.max_players}.` });
            return;
        }

        const gameId = socket.data.user.currentGameId;
        const currentRoundId = socket.data.user.currentRoundId;

        const startTime = Date.now();
        this.startedAt = startTime;

        const startedAtIso = new Date(startTime).toISOString();
        Promise.all([
            db.updateGameStatus(gameId, "in_progress", startedAtIso),
            db.updateRoundStatus(currentRoundId, "in_progress", startedAtIso),
        ]).catch(console.error);

        const startPayload = {
            success: true,
            maskedWord: this.getMaskedWord(userId),
            lives: this.lives,
            startTime
        };
        socket.emit("game:start", startPayload);
        socket.to(gameId).emit("game:start", startPayload);
}
