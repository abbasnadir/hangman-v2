export interface ProcessMoveResult {
    player: any;
    processedMove: { guess: string; correct: boolean; timestamp: Date | string; move_index: number } | null;
    playerResult: "won" | "lost" | "completed" | "in_progress";
    roundEnded: boolean;
    hasNextRound: boolean;
}

export interface DbFunctions {
    insertMove(move: { round_id: string; user_id: string; move_index: number; guess: string; correct: boolean; created_at: string }): Promise<void>;
    getWordlistWords(wordlistId: string): Promise<string[]>;
    getUsedWordsInGame(gameId: string): Promise<Set<string>>;
    insertNewRound(gameId: string, roundIndex: number, word: string, id?: string): Promise<{ id: string } | null>;
    getGamePlayers(gameId: string): Promise<{ user_id: string }[] | null>;
    insertRoundPlayers(players: { game_round_id: string; user_id: string }[]): Promise<{ id: string; user_id: string }[] | null>;
    finishGameRound(roundId: string): Promise<void>;
    finishGame(gameId: string): Promise<void>;
    updateGamePlayerResult(gameId: string, userId: string, result: string): Promise<void>;
    updateRoundPlayerResult(roundId: string, userId: string, result: string): Promise<void>;
    getProfile(userId: string): Promise<{ username: string; pfp: string } | null>;
    abandonGameAndRound(gameId: string, roundId: string): Promise<void>;
    markPlayerAsDisconnectedByRound(roundId: string, userId: string): Promise<void>;
    getActivePlayersCount(roundId: string): Promise<number>;
    updateGameStatus(gameId: string, status: string, startedAt: string): Promise<void>;
    updateRoundStatus(roundId: string, status: string, startedAt: string): Promise<void>;
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
