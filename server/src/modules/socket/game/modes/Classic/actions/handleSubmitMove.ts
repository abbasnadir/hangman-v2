import type { Socket } from "socket.io";
import { z } from "zod";
import * as db from "../../../../../shared/utils/dbQueries.js";
import { activeGameInstances } from "../../../core/registry.js";
import { submitMovePayloadSchema } from "../../../../schemas/gameProcessSchema.js";
import type { Classic } from "../index.js";

export async function handleSubmitMove(this: Classic, socket: Socket, payload: unknown) {
        const currentGameId = socket.data.user.currentGameId;
        let currentRoundId = socket.data.user.currentRoundId;
        const userId = socket.data.user.id;
        const username = socket.data.user.username;
        const pfp = socket.data.user.pfp;

        if (this.currentRoundId) {
            currentRoundId = this.currentRoundId;
        }

        const { guess, timestamp } = payload as z.infer<typeof submitMovePayloadSchema>;
        const move = { guess, timestamp };

        try {
            const checkSocketConnected = () => socket.connected;
            const { moveResponse, finishPromise } = this.onMoveSubmitted(
                userId,
                move,
                currentGameId,
                currentRoundId,
                db,
                checkSocketConnected,
                username,
                pfp
            );

            socket.emit("game:submit_move", moveResponse);

            if (finishPromise) {
                const finishResult = await finishPromise;
                if (finishResult) {
                    socket.emit(finishResult.playerEvent.name, finishResult.playerEvent.payload);
                    socket.to(currentGameId).emit("game:player_finished_broadcast", finishResult.broadcastPayload);


                    if (finishResult.nextRoundPromise) {
                        const nextRoundData = await finishResult.nextRoundPromise;
                        if (nextRoundData) {
                            const allSockets = [...await socket.in(currentGameId).fetchSockets(), socket];
                            for (const s of allSockets) {
                                s.data.user.currentRoundId = nextRoundData.id;
                            }
                            const newRoundPayload = { maskedWord: nextRoundData.maskedWord, startTime: nextRoundData.startTime };
                            socket.to(currentGameId).emit("game:new_round_ready", newRoundPayload);
                            socket.emit("game:new_round_ready", newRoundPayload);
                        }
                    }

                    if (finishResult.gameFullyEnded) {
                        if (finishResult.gameFullyEndedPromise) {
                            finishResult.gameFullyEndedPromise.catch(console.error);
                        }
                        const scores = {};
                        const allSockets = [...await socket.in(currentGameId).fetchSockets(), socket];
                        for (const s of allSockets) {
                            const uid = s.data?.user?.id;
                            const result = uid && typeof (this as any).getFinalResult === 'function' ? (this as any).getFinalResult(uid) : undefined;
                            s.emit("game:fully_completed", { success: true, finalScores: scores, result, leaderboard: finishResult.leaderboard });
                        }
                        delete activeGameInstances[currentGameId];
                    }
                }
            }
        } catch (err: unknown) {
            socket.emit("game:submit_move", { success: false, error: err instanceof Error ? err.message : String(err) });
        }
}
