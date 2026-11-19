import { SinglePlayerMode } from "../../core/SinglePlayerMode.js";

export class Classic extends SinglePlayerMode {
    constructor(lives: number = 5) {
        super("Classic", 1, 1, lives);
    }
}
