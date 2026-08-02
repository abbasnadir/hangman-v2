import type { PlayerFinishedResult } from "../../../../types/gameCore.js";
import type { Classic } from "../index.js";
import * as crypto from "crypto";

export async function triggerRoundTransitionIfNeeded(
    this: Classic,
    gameId: string,
    roundId: string,
    db: any,
    checkSocketConnected: () => boolean,
    dbPromises: Promise<any>[] = []
): Promise<Omit<PlayerFinishedResult, 'playerEvent' | 'broadcastPayload'> | null> {
        const roundEnded = this.completedPlayersCount >= this.totalPlayersCount;
        
        let winnerBroadcastPayload: Record<string, unknown> | undefined = undefined;

        if (!roundEnded) {
            Promise.all(dbPromises).catch(console.error); // fire and forget
            return null;
        }

        dbPromises.push(this.enqueueDbOp(() => db.finishGameRound(roundId)));

        const hasNextRound = this.roundIndex < this.numberOfWords;
        if (!hasNextRound) {
            const gameFullyEndedPromise = this.enqueueDbOp(async () => {
                await db.finishGame(gameId);
                const resultsOps = Object.keys(this.players).map(pid => 
                    db.updateGamePlayerResult(gameId, pid, this.getFinalResult(pid))
                );
                await Promise.all(resultsOps);
            });
            
            const leaderboard = Object.keys(this.players).map(pid => {
                const p = this.players[pid];
                const cached = this.playerProfiles[pid] || { username: "Player", pfp: "" };
                return {
                    userId: pid,
                    username: cached.username || "Player",
                    pfp: cached.pfp || "",
                    score: 0,
                    totalTimeMs: p ? p.getTimeTaken(this.startedAt) : 0
                };
            }).sort((a, b) => a.totalTimeMs - b.totalTimeMs);

            return { winnerBroadcastPayload, roundEnded: true, gameFullyEnded: true, gameFullyEndedPromise, leaderboard };
        }

        if (this._transitioning) {
            Promise.all(dbPromises).catch(console.error);
            return { winnerBroadcastPayload, roundEnded: false, gameFullyEnded: false };
        }
        this._transitioning = true;

        const setupNextRound = async () => {
            if (!checkSocketConnected()) {
                await db.abandonGameAndRound(gameId, roundId);
                await Promise.all(dbPromises);
                throw new Error("Socket disconnected during round transition.");
            }
            this.roundIndex += 1;
            const available = this.wordlistWords.filter((w: string) => !this.usedWords.has(w.toLowerCase()));
            const wordPool = available.length > 0 ? available : this.wordlistWords;
            const newWord: string = wordPool[Math.floor(Math.random() * wordPool.length)] as string;
            this.usedWords.add(newWord.toLowerCase());

            const newRoundId = crypto.randomUUID();
            this.startedAt = Date.now();
            this.resetRound(newWord);
            this.currentRoundId = newRoundId;

            const previousDbOps = Promise.all(dbPromises).catch(console.error);
            this.enqueueDbOp(async () => {
                await previousDbOps;
                const newRound = await db.insertNewRound(gameId, this.roundIndex, newWord, newRoundId);
                if (!newRound) throw new Error("Failed to insert new round into DB.");
                return db.insertRoundPlayers(
                    this.gamePlayerIds.map(uid => ({ game_round_id: newRound.id, user_id: uid }))
                );
            });

            return {
                id: newRoundId,
                maskedWord: this.getMaskedWord(undefined),
                startTime: this.startedAt,
                gamePlayerIds: this.gamePlayerIds,
            };
        };

        return {
            winnerBroadcastPayload,
            roundEnded: true,
            nextRoundPromise: setupNextRound().finally(() => { this._transitioning = false; }),
            gameFullyEnded: false
        };
}
