import type { GameInfo, PlayerState, move } from "../../shared/types/GameInfo.js";

export abstract class GameMode {
    public word: string = "";

    constructor(public name: string, public min_players: number, public max_players: number, public lives: number) { }

    abstract satisfies(players_count: number, ...args: unknown[]): boolean;
    abstract checkMove(move: move, playerState: PlayerState): { valid: boolean, correct: boolean };

    // Process an array of moves for a specific user and track time taken
    abstract processUserMoves(userId: string, moves: move[], gameState: Partial<GameInfo>): { player: PlayerState, processedMoves: { guess: string, correct: boolean, timestamp: Date | string, move_index: number }[], isWinner: boolean, isCorrectCompletion?: boolean };

    // Reset state for a new round
    abstract resetRound(word: string): void;
}