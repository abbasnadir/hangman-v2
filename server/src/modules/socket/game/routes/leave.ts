import type { Socket } from "socket.io";
import { activeGameInstances } from "../utils/registry.js";
import { dbAdapter as db } from "../utils/dbAdapter.js";
import { supabase } from "../../../app/lib/supabaseClient.js";

export const leaveHandler = async (socket: Socket) => {
    const userId = socket.data.user.id;
    let currentRoundId = socket.data.user.currentRoundId;
    const currentGameId = socket.data.user.currentGameId;

    if (!currentGameId) {
        socket.emit("game:leave", { success: false, error: "Not in a game." });
        return;
    }

    try {
        const gameMode = activeGameInstances[currentGameId];
        if (gameMode && (gameMode as any).currentRoundId) {
            currentRoundId = (gameMode as any).currentRoundId;
        }
        let word: string | undefined = undefined;

        if (gameMode && currentRoundId) {
            word = gameMode.word;
            const { gameAbandoned, transitionResult } = await gameMode.onPlayerLeave(
                currentRoundId, currentGameId, userId, db,
                () => socket.connected
            );
            if (gameAbandoned) {
                delete activeGameInstances[currentGameId];
                socket.to(currentGameId).emit("game:abandoned", { success: true });
            } else if (transitionResult) {
                if (transitionResult.winnerBroadcastPayload) {
                    socket.to(currentGameId).emit("game:player_finished_broadcast", transitionResult.winnerBroadcastPayload);
                }
                if (transitionResult.nextRoundPromise) {
                    const nextRoundData = await transitionResult.nextRoundPromise;
                    if (nextRoundData) {
                        const newRoundPayload = { maskedWord: nextRoundData.maskedWord, startTime: nextRoundData.startTime };
                        socket.to(currentGameId).emit("game:new_round_ready", newRoundPayload);
                    }
                }
                if (transitionResult.gameFullyEnded) {
                    socket.to(currentGameId).emit("game:fully_completed", { success: true, result: "won" });
                    delete activeGameInstances[currentGameId];
                }
            }
        }

        // Clean up DB for global abandonment if the game wasn't started or user was just in lobby
        if (!gameMode) {
            const { data } = await supabase.from("games").select("created_by").eq("id", currentGameId).single();
            if (data?.created_by === socket.data.user.id) {
                await db.abandonGameAndRound(currentGameId, currentRoundId || "");
                socket.to(currentGameId).emit("game:abandoned", { success: true });
            }
        }

        socket.leave(currentGameId);

        // Delete from socket data so they can join another game
        delete socket.data.user.currentGameId;
        delete socket.data.user.currentRoundId;
        delete socket.data.user.currentRoundPlayerId;

        socket.emit("game:leave", { success: true, word });
    } catch (e: unknown) {
        socket.emit("game:leave", { success: false, error: e instanceof Error ? e.message : String(e) });
    }
};
