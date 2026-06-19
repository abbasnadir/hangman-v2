import { GameMode } from './defModes.js';
import type { GameInfo, PlayerState, move } from "../../shared/types/GameInfo.js";

export class Classic extends GameMode {
    players: Record<string, PlayerState> = {};
    winner: string | null = null; // store the first player who completes

    constructor(lives: number = 5) {
        super("Classic", 1, 1, lives);
    }

    satisfies(players_count: number): boolean {
        return players_count === 1;
    }

    checkMove(move: move, playerState: PlayerState): { valid: boolean, correct: boolean } {
        const guess = move.guess.toLowerCase();
        // Validation: Must not be previously guessed (length/type handled by Zod)
        if (playerState.move_set.includes(guess)) return { valid: false, correct: false };

        const correct = this.word.toLowerCase().includes(guess);
        return { valid: true, correct };
    }

    processUserMoves(userId: string, moves: move[], gameState: Partial<GameInfo>) {
        if (!this.players[userId]) {
            this.players[userId] = {
                timeTaken: 0,
                lastMoveTimestamp: null,
                move_set: [],
                completed: false,
                lives: this.lives,
                move_index: 0
            };
        }

        const player = this.players[userId];
        if (player.completed) return { player, processedMoves: [], isWinner: false };

        // Sort moves by timestamp to calculate time differences properly
        const sortedMoves = [...moves].sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Compute target letters once outside the loop to optimize performance
        const targetLetters = new Set(this.word.toLowerCase().split(''));
        const processedMoves = [];
        let justWon = false;
        let isCorrectCompletion = false;

        for (const m of sortedMoves) {
            if (player.completed) break;

            const { valid, correct } = this.checkMove(m, player);
            if (valid) {
                const moveTime = new Date(m.timestamp).getTime();

                if (player.lastMoveTimestamp !== null) {
                    const timeSpent = moveTime - player.lastMoveTimestamp;
                    if (timeSpent > 0) {
                        player.timeTaken += timeSpent;
                    }
                }
                player.lastMoveTimestamp = moveTime;

                const guess = m.guess.toLowerCase();
                player.move_set.push(guess);
                player.move_index += 1;

                processedMoves.push({
                    guess: guess,
                    correct,
                    timestamp: m.timestamp,
                    move_index: player.move_index
                });

                if (!correct) {
                    player.lives -= 1;
                    if (player.lives <= 0) {
                        player.completed = true; // Lost
                    }
                } else {
                    // Check if won (all unique letters in word are guessed)
                    let allGuessed = true;
                    for (const letter of targetLetters) {
                        if (!player.move_set.includes(letter)) {
                            allGuessed = false;
                            break;
                        }
                    }

                    if (allGuessed) {
                        player.completed = true;
                        isCorrectCompletion = true;
                        if (!this.winner) {
                            this.winner = userId;
                            justWon = true;
                        }
                    }
                }
            }
        }

        return { player, processedMoves, isWinner: justWon, isCorrectCompletion };
    }

    resetRound(word: string): void {
        this.word = word;
        this.winner = null;
        this.players = {};
    }
}