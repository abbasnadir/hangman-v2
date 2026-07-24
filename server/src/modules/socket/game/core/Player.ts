export class Player {
    public move_set: string[] = [];
    public move_index: number = 0;
    public completed: boolean = false;
    public finalTime: number = 0;
    public isConnected: boolean = true;

    public startedAt: number = 0;

    constructor(
        public id: string,
        public lives: number
    ) {}

    startRound(startedAt: number) {
        this.startedAt = startedAt;
        this.completed = false;
        this.finalTime = 0;
        this.move_set = [];
        this.move_index = 0;
    }

    recordGuess(guess: string, isCorrect: boolean, fallbackStartedAt: number) {
        if (this.completed) return;
        
        this.move_set.push(guess);
        this.move_index += 1;

        if (!isCorrect) {
            this.lives -= 1;
            if (this.lives <= 0) {
                this.finish(fallbackStartedAt);
            }
        }
    }

    finish(fallbackStartedAt: number) {
        if (this.completed) return;
        this.completed = true;
        const start = this.startedAt || fallbackStartedAt;
        this.finalTime = Date.now() - start;
    }

    disconnect(fallbackStartedAt: number) {
        this.isConnected = false;
        this.finish(fallbackStartedAt);
    }

    getTimeTaken(fallbackStartedAt: number): number {
        if (this.completed) return this.finalTime;
        const start = this.startedAt || fallbackStartedAt;
        return Date.now() - start;
    }
}
