import { GameMode, type ProcessMoveResult } from "./defModes.js";
import type { GameInfo, move } from "../../shared/types/GameInfo.js";
import { Player } from "./Player.js";

export class Multiplayer extends GameMode {
    winner: string | null = null;

    constructor(lives: number = 5) {
        super("Multiplayer", 2, 50, lives);
    }

    satisfies(players_count: number): boolean {
        return players_count >= this.min_players && players_count <= this.max_players;
    }

    processMove(userId: string, move: move, _gameState: Partial<GameInfo>): ProcessMoveResult {
        if (!this.players[userId]) {
            this.players[userId] = new Player(userId, this.lives);
        }

        const player = this.players[userId];

        // Player already completed — return their final state
        if (player.completed) {
            return {
                player,
                processedMove: null,
                playerResult: this.winner === userId ? "won" : this.winner ? "completed" : "lost",
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
                // First player to correctly guess the whole word wins
                if (!this.winner) { this.winner = userId; justWon = true; }
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

    resetRound(word: string): void {
        this.word = word;
        this.winner = null;
        this.players = {};
        this.completedPlayersCount = 0;
        this.startedAt = Date.now();
        // totalPlayersCount is game-level — NOT reset here
    }
}
