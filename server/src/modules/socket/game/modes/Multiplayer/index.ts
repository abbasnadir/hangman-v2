import { GameMode } from "../../core/GameMode.js";
import type { GameInfo, move } from "../../../../shared/types/GameInfo.js";
import { Player } from "../../core/Player.js";
import type { ProcessMoveResult } from "../../core/types.js";

export class Multiplayer extends GameMode {
    winner: string | null = null;
    minTime: number = Infinity;
    scores: Record<string, number> = {};

    constructor(lives: number = 5) {
        super("Multiplayer", 2, 50, lives);
    }

    satisfies(players_count: number): boolean {
        return players_count >= this.min_players && players_count <= this.max_players;
    }

    processMove(userId: string, move: move, _gameState: Partial<GameInfo>): ProcessMoveResult {
        if (!this.players[userId]) {
            this.players[userId] = new Player(userId, this.lives);
            if (this.scores[userId] === undefined) this.scores[userId] = 0;
        }

        const player = this.players[userId];
        const isRoundEnded = this.completedPlayersCount >= this.totalPlayersCount;

        if (player.completed) {
            return {
                player,
                processedMove: null,
                playerResult: "in_progress", // Prevent duplicate orchestration
                roundEnded: isRoundEnded,
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
                
                const timeTaken = player.getTimeTaken(this.startedAt);
                if (timeTaken < this.minTime) {
                    this.minTime = timeTaken;
                    this.winner = userId;
                }
            }
        } else if (player.lives === 0) {
            player.finish(this.startedAt);
            this.completedPlayersCount++;
        }

        let playerResult: ProcessMoveResult["playerResult"] = "in_progress";
        if (player.completed) {
            if (userId === this.winner) {
                playerResult = "won";
            } else if (player.lives === 0) {
                playerResult = "lost";
            } else {
                playerResult = "completed";
            }
            
            // Award score immediately to the winner once they finish
            if (userId === this.winner && !(this as any).roundScoreAwarded) {
                this.scores[this.winner] = (this.scores[this.winner] || 0) + 1;
                (this as any).roundScoreAwarded = true;
            }
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
        this.minTime = Infinity;
        this.players = {};
        this.completedPlayersCount = 0;
        (this as any).roundScoreAwarded = false;
    }

    getFinalResult(userId: string): string {
        const maxScore = Math.max(0, ...Object.values(this.scores));
        const winners = Object.keys(this.scores).filter(id => this.scores[id] === maxScore && maxScore > 0);
        if (winners.includes(userId)) return "won";
        const p = this.players[userId];
        if (p && p.completed && p.lives > 0) return "completed";
        return "lost";
    }
}
