export class Player {
    public move_set: string[] = [];
    public move_index: number = 0;
    public completed: boolean = false;
    public finalTime: number = 0;
    public isConnected: boolean = true;

    constructor(
        public id: string,
        public lives: number
    ) {}

    recordGuess(guess: string, isCorrect: boolean, globalStartedAt: number) {
        if (this.completed) return;
        
        this.move_set.push(guess);
        this.move_index += 1;

        if (!isCorrect) {
            this.lives -= 1;
            if (this.lives <= 0) {
                this.finish(globalStartedAt);
            }
        }
    }

    finish(globalStartedAt: number) {
        if (this.completed) return;
        this.completed = true;
        this.finalTime = Date.now() - globalStartedAt;
    }

    disconnect(globalStartedAt: number) {
        this.isConnected = false;
        this.finish(globalStartedAt);
    }

    getTimeTaken(globalStartedAt: number): number {
        if (this.completed) return this.finalTime;
        return Date.now() - globalStartedAt;
    }
}
