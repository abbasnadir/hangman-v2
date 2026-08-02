import type { Classic } from "../index.js";
import type { ProcessMoveResult } from "../../../../types/gameCore.js";
import { Player } from "../../../core/Player.js";
import type { move, GameInfo } from "../../../../../shared/types/GameInfo.js";

export function processMove(this: Classic, userId: string, move: move, _gameState: Partial<GameInfo>): ProcessMoveResult {
    if (!this.players[userId]) {
        this.players[userId] = new Player(userId, this.lives);
    }

    const player = this.players[userId];

    // Player already completed — return their final state
    if (player.completed) {
        return {
            player,
            processedMove: null,
            playerResult: "in_progress", // Prevent duplicate orchestration
            roundEnded: this.completedPlayersCount >= this.totalPlayersCount,
            hasNextRound: this.roundIndex < this.numberOfWords
        };
    }

    const guess = move.guess.toLowerCase();

    // Duplicate guess — silently ignore
    if (player.move_set.includes(guess)) {
        return {
            player,
            processedMove: null,
            playerResult: "in_progress",
            roundEnded: this.completedPlayersCount >= this.totalPlayersCount,
            hasNextRound: this.roundIndex < this.numberOfWords
        };
    }

    const correct = this.word.toLowerCase().includes(guess);
    player.recordGuess(guess, correct, this.startedAt);

    const processedMove = { guess, correct, timestamp: move.timestamp, move_index: player.move_index };

    let justWon = false;
    let isCorrectCompletion = false;

    if (correct) {
        const targetLetters = new Set(this.word.toLowerCase().replace(/[^a-z]/g, ""));
        const allGuessed = [...targetLetters].every(l => player.move_set.includes(l));
        if (allGuessed) {
            player.finish(this.startedAt);
            this.completedPlayersCount++;
            isCorrectCompletion = true;
            justWon = true;
        }
    } else if (player.lives === 0) {
        player.finish(this.startedAt);
        this.completedPlayersCount++;
    }

    let playerResult: ProcessMoveResult["playerResult"] = "in_progress";
    if (player.completed) {
        if (justWon) playerResult = "won";
        else if (isCorrectCompletion) playerResult = "completed";
        else playerResult = "lost";
    }

    return {
        player,
        processedMove,
        playerResult,
        roundEnded: this.completedPlayersCount >= this.totalPlayersCount,
        hasNextRound: this.roundIndex < this.numberOfWords
    };
}