import type { GameInfo, move } from "../../shared/types/GameInfo.js";
import { Player } from "./Player.js";

export abstract class GameMode {
    public word: string = "";
    public startedAt: number = Date.now();
    public players: Record<string, Player> = {};

    constructor(public name: string, public min_players: number, public max_players: number, public lives: number) { }

    abstract satisfies(players_count: number, ...args: unknown[]): boolean;
    // Process a single move for a specific user, handle state, and track time taken
    abstract processMove(userId: string, move: move, gameState: Partial<GameInfo>): { player: Player, processedMove: { guess: string, correct: boolean, timestamp: Date | string, move_index: number } | null, isWinner: boolean, isCorrectCompletion?: boolean };

    // Reset state for a new round
    abstract resetRound(word: string): void;
}