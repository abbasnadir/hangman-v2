import { GameMode } from './defModes.js';
import type { GameInfo, move } from "../../shared/types/GameInfo.js";
import { Player } from './Player.js';

export class Classic extends GameMode {
    winner: string | null = null; // store the first player who completes

    constructor(lives: number = 5) {
        super("Classic", 1, 1, lives);
    }

    satisfies(players_count: number): boolean {
        return players_count === 1;
    }

    processMove(userId: string, move: move, gameState: Partial<GameInfo>) {
        if (!this.players[userId]) {
            this.players[userId] = new Player(userId, this.lives);
        }

        const player = this.players[userId];
        if (player.completed) return { player, processedMove: null, isWinner: false, isCorrectCompletion: false };

        const guess = move.guess.toLowerCase();

        // 1. Validation (must not be previously guessed)
        if (player.move_set.includes(guess)) {
            return { player, processedMove: null, isWinner: false, isCorrectCompletion: false };
        }

        // 2. Evaluate Guess and Record it inside the Player class
        const correct = this.word.toLowerCase().includes(guess);
        player.recordGuess(guess, correct, this.startedAt);

        const processedMove = {
            guess,
            correct,
            timestamp: move.timestamp,
            move_index: player.move_index
        };

        let justWon = false;
        let isCorrectCompletion = false;

        if (correct) {
            // Check if won (all unique letters in word are guessed)
            const targetLetters = new Set(this.word.toLowerCase().split(''));
            let allGuessed = true;
            for (const letter of targetLetters) {
                if (!player.move_set.includes(letter)) {
                    allGuessed = false;
                    break;
                }
            }

            if (allGuessed) {
                player.finish(this.startedAt);
                isCorrectCompletion = true;
                if (!this.winner) {
                    this.winner = userId;
                    justWon = true;
                }
            }
        }

        return { player, processedMove, isWinner: justWon, isCorrectCompletion };
    }

    resetRound(word: string): void {
        this.word = word;
        this.winner = null;
        this.players = {};
        this.startedAt = Date.now(); // Reset global clock for the new round
    }
}