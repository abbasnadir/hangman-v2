import type { GameInfo, move } from "../../shared/types/GameInfo.js";
import { Player } from "./Player.js";

export abstract class GameMode {
    public word: string = "";
    public startedAt: number = Date.now();
    public players: Record<string, Player> = {};
    public numberOfWords!: number;
    public wordlistId!: string;
    public roundIndex!: number;
    public completedPlayersCount: number = 0;
    public totalPlayersCount: number = 0;

    constructor(public name: string, public min_players: number, public max_players: number, public lives: number) { }

    abstract satisfies(players_count: number, ...args: unknown[]): boolean;
    // Process a single move for a specific user, handle state, and track time taken
    abstract processMove(userId: string, move: move, gameState: Partial<GameInfo>): { player: Player, processedMove: { guess: string, correct: boolean, timestamp: Date | string, move_index: number } | null, isWinner: boolean, isCorrectCompletion?: boolean };

    // Reset state for a new round
    abstract resetRound(word: string): void;

    // Helper to get the word masked by the player's guesses
    getMaskedWord(userId: string | undefined): string[] {
        const player = this.players[userId!];
        if (!player) return Array.from(
            this.word.replace(/[A-Za-z]/g, '_')
        );

        return this.word.split('').map(letter => {
            if (!/[a-z]/i.test(letter)) return letter;
            return player.move_set.includes(letter.toLowerCase()) ? letter.toUpperCase() : "_";
        });
    }
}