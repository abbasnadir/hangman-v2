export interface ProcessMoveResult {
    player: any;
    processedMove: { guess: string; correct: boolean; timestamp: Date | string; move_index: number } | null;
    playerResult: "won" | "lost" | "completed" | "in_progress";
    roundEnded: boolean;
    hasNextRound: boolean;
}

export interface NextRoundData {
    id: string;
    maskedWord: string[];
    startTime: number;
    lives: number;
    gamePlayerIds: string[];
}

export interface LeaderboardEntry {
    userId: string;
    username: string;
    pfp: string;
    score: number;
    totalTimeMs: number;
}

export interface RoundTransitionResult {
    winnerBroadcastPayload?: Record<string, unknown> | null | undefined;
    nextRoundPromise?: Promise<NextRoundData | null> | undefined;
    gameFullyEnded?: boolean | undefined;
    gameFullyEndedPromise?: Promise<any> | undefined;
    leaderboard?: LeaderboardEntry[] | undefined;
}

export interface PlayerFinishedResult {
    playerEvent: "game:player_won" | "game:player_lost" | "game:player_completed" | "game:next_round";
    playerPayload: Record<string, unknown>;
    broadcastPayload: Record<string, unknown>;
    winnerBroadcastPayload?: Record<string, unknown> | null | undefined;
    roundEnded: boolean;
    nextRoundPromise?: Promise<NextRoundData | null> | undefined;
    gameFullyEnded: boolean;
    gameFullyEndedPromise?: Promise<any> | undefined;
    leaderboard?: LeaderboardEntry[] | undefined;
}

export interface MoveSubmittedResult {
    moveResponse: Record<string, unknown>;
    finishPromise: Promise<PlayerFinishedResult | null>;
}

export interface PlayerLeaveResult {
    gameAbandoned: boolean;
}

/** Sent to clients of timed modes so they can render the countdown. */
export interface TimerPayload {
    timeLimitMs: number;
    remainingMs: number;
    penaltyMs: number;
}
