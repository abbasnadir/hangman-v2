export interface ProcessMoveResult {
    player: any;
    processedMove: { guess: string; correct: boolean; timestamp: Date | string; move_index: number } | null;
    playerResult: "won" | "lost" | "completed" | "in_progress";
    roundEnded: boolean;
    hasNextRound: boolean;
}

export interface PlayerFinishedResult {
    playerEvent: {
        name: "game:player_won" | "game:player_lost" | "game:player_completed" | "game:next_round";
        payload: Record<string, unknown>;
    };
    broadcastPayload: Record<string, unknown>;
    winnerBroadcastPayload?: Record<string, unknown> | undefined;
    roundEnded: boolean;
    nextRoundPromise?: Promise<{
        id: string;
        maskedWord: string[];
        startTime: number;
        gamePlayerIds: string[];
    } | null>;
    gameFullyEnded: boolean;
    gameFullyEndedPromise?: Promise<any>;
    leaderboard?: Array<{
        userId: string;
        username: string;
        pfp: string;
        score: number;
        totalTimeMs: number;
    }>;
}

export interface MoveSubmittedResult {
    moveResponse: Record<string, unknown>;
    finishPromise: Promise<PlayerFinishedResult | null>;
}

export interface PlayerLeaveResult {
    gameAbandoned: boolean;
}
