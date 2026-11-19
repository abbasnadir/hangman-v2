import type { CoreGameMode } from "./CoreGameMode.js";
import { Classic } from "../modes/Classic/index.js";
import { Multiplayer } from "../modes/Multiplayer/index.js";
import { InverseSinglePlayer } from "../modes/InverseSinglePlayer/index.js";

/** Must match the ids in the `game_modes` table. */
export const GAME_MODE_IDS = {
    CLASSIC: 1,
    MULTIPLAYER: 2,
    COUNTDOWN: 3,
} as const;

export function createGameMode(modeId: number, totalLives: number): CoreGameMode {
    switch (modeId) {
        case GAME_MODE_IDS.MULTIPLAYER:
            return new Multiplayer(totalLives);
        case GAME_MODE_IDS.COUNTDOWN:
            return new InverseSinglePlayer(totalLives);
        case GAME_MODE_IDS.CLASSIC:
        default:
            return new Classic(totalLives);
    }
}
