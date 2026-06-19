export type GameInfo = {
    id: string;
    players_count: number;
    min_players: number;
    max_players: number;
    mode: string;
    creator_id: string;
    created_at: Date;
    status: "abandoned" | "in_progress" | "finished";
};

export interface move {
    guess: string;
    timestamp: Date;
}

export type PlayerState = {
    timeTaken: number;
    lastMoveTimestamp: number | null;
    move_set: string[];
    completed: boolean;
    lives: number;
    move_index: number;
};
