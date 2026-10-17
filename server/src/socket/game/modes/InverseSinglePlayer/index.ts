import { SinglePlayerMode } from "../../core/SinglePlayerMode.js";
import { Player } from "../../core/Player.js";
import type { ProcessMoveResult } from "../../../types/gameCore.js";
import type { GameInfo, move } from "../../../../shared/types/GameInfo.js";

export class InverseSinglePlayer extends SinglePlayerMode {
    constructor(lives: number = 5) {
        super("InverseSinglePlayer", 1, 1, lives);
    }

    evaluatePlayerResult(userId: string, isSolved: boolean): "won" | "lost" | "completed" | "in_progress" {
        const player = this.players[userId];
        return (player && player.lives > 0) ? "won" : "lost";
    }

    resetRound(word: string): void {
        this.word = word;
        this.players = {};
        this.completedPlayersCount = 0;
    }

    getFinalResult(userId: string): string {
        const p = this.players[userId];
        return (p?.completed && p.lives > 0) ? "won" : "lost";
    }
}
