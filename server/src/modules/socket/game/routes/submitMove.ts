import { z } from "zod";
import type { Socket } from "socket.io";
import { activeGameInstances } from "../utils/registry.js";
import { dbAdapter as db } from "../utils/dbAdapter.js";
import { submitMovePayloadSchema } from "../../schemas/gameProcessSchema.js";

export const submitMoveHandler = async (socket: Socket, payload: unknown) => {
    // Check if user is in an active game
    const currentGameId = socket.data.user.currentGameId;
    let currentRoundId = socket.data.user.currentRoundId;
    const userId = socket.data.user.id;
    const username = socket.data.user.username;
    const pfp = socket.data.user.pfp;

    if (!currentGameId || !currentRoundId) {
        socket.emit("game:submit_move", { success: false, error: "You are not in an active game." });
        return;
    }

    const gameMode = activeGameInstances[currentGameId];
    if (gameMode && (gameMode as any).currentRoundId) {
        currentRoundId = (gameMode as any).currentRoundId;
    }

    if (!gameMode) {
        socket.emit("game:submit_move", { success: false, error: "Game not started or session lost." });
        return;
    }

    // Parse and validate move payload
    const { guess, timestamp } = payload as z.infer<typeof submitMovePayloadSchema>;
    const move = { guess, timestamp };

    try {
        const checkSocketConnected = () => socket.connected;
        const { moveResponse, finishPromise } = gameMode.onMoveSubmitted(
            userId,
            move,
            currentGameId,
            currentRoundId,
            db,
            checkSocketConnected,
            username,
            pfp
        );

        // Emit move response to this player IMMEDIATELY
        socket.emit("game:submit_move", moveResponse);

        // If the player finished, wait for orchestration and emit all finish-related events
        if (finishPromise) {
            const finishResult = await finishPromise;
            if (finishResult) {
                // Emits won/lost/completed/next_round directly back to the player
                socket.emit(finishResult.playerEvent.name, finishResult.playerEvent.payload);

                // Emits a generic 'finished' broadcast to all *other* players in the game
                socket.to(currentGameId).emit("game:player_finished_broadcast", finishResult.broadcastPayload);

                // If someone finished the round early by winning, let everyone know
                if (finishResult.winnerBroadcastPayload) {
                    socket.emit("game:player_finished_broadcast", finishResult.winnerBroadcastPayload);
                    socket.to(currentGameId).emit("game:player_finished_broadcast", finishResult.winnerBroadcastPayload);
                }

                // If round ended and we have a next round to transition to
                if (finishResult.nextRoundPromise) {
                    const nextRoundData = await finishResult.nextRoundPromise;
                    if (nextRoundData) {
                        // Patch currentRoundId on all sockets IMMEDIATELY (does not mutate remote instances)
                        const allSockets = [...await socket.in(currentGameId).fetchSockets(), socket];
                        for (const s of allSockets) {
                          s.data.user.currentRoundId = nextRoundData.id;
                        }

                        // Emit round-ready right away — game can start
                        const newRoundPayload = { maskedWord: nextRoundData.maskedWord, startTime: nextRoundData.startTime };
                        socket.to(currentGameId).emit("game:new_round_ready", newRoundPayload);
                        socket.emit("game:new_round_ready", newRoundPayload);
                    }
                }

                if (finishResult.gameFullyEnded) {
                    if (finishResult.gameFullyEndedPromise) {
                        // Fire-and-forget: do not block the client response on DB writes
                        finishResult.gameFullyEndedPromise.catch(console.error);
                    }
                    const scores: Record<string, number> = 'scores' in gameMode ? (gameMode as any).scores : {};
                    const allSockets = [...await socket.in(currentGameId).fetchSockets(), socket];
                    for (const s of allSockets) {
                      const uid = s.data?.user?.id;
                      const result = uid && typeof (gameMode as any).getFinalResult === 'function' ? (gameMode as any).getFinalResult(uid) : undefined;
                      s.emit("game:fully_completed", { success: true, finalScores: scores, result, leaderboard: finishResult.leaderboard });
                    }
                    delete activeGameInstances[currentGameId];
                }
            }
        }
    } catch (err: unknown) {
        socket.emit("game:submit_move", { success: false, error: err instanceof Error ? err.message : String(err) });
    }
};
