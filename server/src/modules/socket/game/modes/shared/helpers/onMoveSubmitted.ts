import type { MoveSubmittedResult } from "../../../../types/gameCore.js";
import type { GameMode } from "../../../core/GameMode.js";
import type { move } from "../../../../../shared/types/GameInfo.js";

export function onMoveSubmitted(
    this: GameMode,
    userId: string,
    move: move,
    gameId: string,
    roundId: string,
    db: any,
    checkSocketConnected: () => boolean,
    username?: string,
    pfp?: string
): MoveSubmittedResult {
        if (this.currentRoundId !== roundId) {
            return {
                moveResponse: { success: false, error: "Move submitted for an old round." },
                finishPromise: Promise.resolve(null)
            };
        }
        // Cache player profile in memory to avoid DB lookups during broadcasts
        if (username) {
            this.playerProfiles[userId] = { username, pfp: pfp || "" };
        }

        const { player, processedMove, playerResult } = this.processMove(userId, move, {});

        // Build the immediate move response for this player
        const moveResponse = {
            success: true,
            timeTakenMs: player.getTimeTaken(this.startedAt),
            move_set: player.move_set,
            lives: player.lives,
            completed: player.completed,
            maskedWord: this.getMaskedWord(userId),
        };

        // Persist move to DB (fire-and-forget, but guarantee osrdering)
        if (processedMove) {
            this.enqueueDbOp(() => db.insertMove({
                round_id: roundId,
                user_id: userId,
                move_index: processedMove.move_index,
                guess: processedMove.guess,
                correct: processedMove.correct,
                created_at: typeof processedMove.timestamp === "string"
                    ? processedMove.timestamp
                    : processedMove.timestamp.toISOString(),
            }));
        }

        // Player still playing — just return the move response
        if (playerResult === "in_progress") {
            return { moveResponse, finishPromise: Promise.resolve(null) };
        }

        // Player finished — delegate full orchestration to onPlayerFinished
        const finishPromise = this.onPlayerFinished(
            userId, playerResult, gameId, roundId, db, checkSocketConnected, username, pfp
        );

        return { moveResponse, finishPromise };
}
