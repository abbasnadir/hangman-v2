import type { PlayerFinishedResult } from "../../../../types/gameCore.js";
import type { Classic } from "../index.js";

export async function onPlayerFinished(
    this: Classic,
    userId: string,
    playerResult: "won" | "lost" | "completed",
    gameId: string,
    roundId: string,
    db: any,
    checkSocketConnected: () => boolean,
    cachedUsername?: string,
    cachedPfp?: string
): Promise<PlayerFinishedResult> {
        const player = this.players[userId];
        if (!player) throw new Error(`Player ${userId} not found in game state.`);
        const timeTakenMs = player.getTimeTaken(this.startedAt);
        const previousWord = this.word;
        const hasNextRound = this.roundIndex < this.numberOfWords;

        // Use cached profile (set in onMoveSubmitted from socket.data.user)
        const cached = this.playerProfiles[userId];
        const username = cachedUsername || cached?.username || "Player";
        const pfp = cachedPfp || cached?.pfp || "";

        // Persist round-player result
        const dbPromises: Promise<any>[] = [];
        dbPromises.push(this.enqueueDbOp(() => db.updateRoundPlayerResult(roundId, userId, playerResult)));

        const currentScore = 0;

        // ── Build the event that goes to THIS player ────────────────────────
        const playerEvent: PlayerFinishedResult["playerEvent"] = hasNextRound
            ? {
                name: "game:next_round",
                payload: { roundResult: playerResult, word: previousWord, timeTakenMs, username, pfp, score: currentScore, lives: this.lives }
              }
            : playerResult === "won"
            ? { name: "game:player_won", payload: { userId, timeTakenMs, word: previousWord, username, pfp, score: currentScore } }
            : playerResult === "completed"
            ? { name: "game:player_completed", payload: { userId, timeTakenMs, word: previousWord, username, pfp, score: currentScore } }
            : { name: "game:player_lost", payload: { userId, timeTakenMs, word: previousWord, username, pfp, score: currentScore } };

        // ── Build the broadcast that goes to all OTHER players ──────────────
        const broadcastPayload = { userId, result: playerResult, timeTakenMs, lives: player.lives, username, pfp, score: currentScore };


        const transition = await this.triggerRoundTransitionIfNeeded(gameId, roundId, db, checkSocketConnected, dbPromises);
        if (!transition) {
            return { playerEvent, broadcastPayload, roundEnded: false, gameFullyEnded: false };
        }
        
        const result: PlayerFinishedResult = {
            playerEvent,
            broadcastPayload,
            roundEnded: transition.roundEnded,
            gameFullyEnded: transition.gameFullyEnded,
            leaderboard: 'leaderboard' in transition ? (transition as any).leaderboard : undefined
        };
        if (transition.winnerBroadcastPayload) result.winnerBroadcastPayload = transition.winnerBroadcastPayload;
        if (transition.nextRoundPromise) result.nextRoundPromise = transition.nextRoundPromise;
        if (transition.gameFullyEndedPromise) result.gameFullyEndedPromise = transition.gameFullyEndedPromise;
        
        return result;
}
