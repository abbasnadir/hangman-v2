import { onMoveSubmitted } from "../../core/onMoveSubmitted.js";
import { onPlayerFinished } from "./actions/onPlayerFinished.js";
import { triggerRoundTransitionIfNeeded } from "./actions/triggerRoundTransitionIfNeeded.js";
import { handleStart } from "./actions/handleStart.js";
import { handleSubmitMove } from "./actions/handleSubmitMove.js";
import { handleDisconnect } from "./actions/handleDisconnect.js";
import { handleLeave } from "./actions/handleLeave.js";
import { handleJoin } from "./actions/handleJoin.js";
import { processMove } from "./actions/processMove.js";
import { GameMode } from "../../core/GameMode.js";
import type { GameInfo, move } from "../../../../shared/types/GameInfo.js";
import { Player } from "../../core/Player.js";
import type { ProcessMoveResult } from "../../../types/gameCore.js";

export class Classic extends GameMode {

    constructor(lives: number = 5) {
        super("Classic", 1, 1, lives);
    }

    satisfies(players_count: number): boolean {
        return players_count === 1;
    }


    resetRound(word: string): void {
        this.word = word;
        this.players = {};
        this.completedPlayersCount = 0;
        // this.startedAt = Date.now(); // will be set by GameMode when round actually starts
        // totalPlayersCount is game-level — NOT reset here
    }

    getFinalResult(userId: string): string {
        const p = this.players[userId];
        if (p && p.completed) {
            if (p.lives > 0) return "won";
        }
        return "lost";
    }

    processMove = processMove;
    handleStart = handleStart;
    handleSubmitMove = handleSubmitMove;
    handleDisconnect = handleDisconnect;
    handleLeave = handleLeave;
    handleJoin = handleJoin;

    onMoveSubmitted = onMoveSubmitted;
    onPlayerFinished = onPlayerFinished;
    triggerRoundTransitionIfNeeded = triggerRoundTransitionIfNeeded;
}
