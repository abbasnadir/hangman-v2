import type { Socket } from "socket.io";
import { supabase } from "../../../app/lib/supabaseClient.js";
import { activeGameInstances } from "../utils/registry.js";
import { dbAdapter as db } from "../utils/dbAdapter.js";
import { getActivePlayersCount } from "../../../shared/utils/dbQueries.js";
import { Classic } from "../modes/Classic/index.js";
import { Multiplayer } from "../modes/Multiplayer/index.js";
import type { GameMode } from "../core/GameMode.js";

export const startHandler = async (socket: Socket) => {
    const userId = socket.data.user.id;
    const currentGameId = socket.data.user.currentGameId;
    const currentRoundId = socket.data.user.currentRoundId;

    if (!currentGameId) {
        socket.emit("game:start", { success: false, error: "You must join a game before starting it." });
        return;
    }
    if (activeGameInstances[currentGameId] && activeGameInstances[currentGameId].startedAt) {
        socket.emit("game:start", { success: false, error: "This game has already been started." });
        return;
    }
    if (!currentRoundId) {
        socket.emit("game:start", { success: false, error: "No active round found." });
        return;
    }

    try {
        // Fetch and validate game ownership
        const { data: gameData, error: gameError } = await supabase
            .from("games")
            .select("created_by, mode_id, wordlist_id, total_lives, number_of_words")
            .eq("id", currentGameId)
            .single();

        if (gameError || !gameData) {
            socket.emit("game:start", { success: false, error: "Failed to fetch game details." });
            return;
        }
        if (gameData.created_by !== userId) {
            socket.emit("game:start", { success: false, error: "Only the game owner can start the game." });
            return;
        }

        // Fetch round word + player count + wordlist words + game player IDs in parallel
        const [roundData, playersCount, wordlistResult, gamePlayers] = await Promise.all([
            supabase.from("game_rounds").select("word, round_index").eq("id", currentRoundId).single(),
            getActivePlayersCount(currentRoundId),
            supabase.from("wordlists").select("words").eq("id", gameData.wordlist_id).single(),
            supabase.from("game_players").select("user_id").eq("game_id", currentGameId),
        ]);

        if (roundData.error || !roundData.data?.word) {
            socket.emit("game:start", { success: false, error: "Failed to load round data." });
            return;
        }

        // Create the correct GameMode subclass and validate player count
        const gameMode: GameMode = gameData.mode_id === 2
            ? new Multiplayer(gameData.total_lives)
            : new Classic(gameData.total_lives);

        if (!gameMode.satisfies(playersCount)) {
            socket.emit("game:start", {
                success: false,
                error: `Player count not met. Have ${playersCount}, need ${gameMode.min_players}–${gameMode.max_players}.`,
            });
            return;
        }

        // Delegate all initialization to GameMode (sets state + persists DB)
        const { maskedWord, startTime } = await gameMode.initialize({
            gameId: currentGameId,
            roundId: currentRoundId,
            word: roundData.data.word,
            roundIndex: roundData.data.round_index,
            numberOfWords: gameData.number_of_words,
            wordlistId: gameData.wordlist_id,
            totalPlayers: playersCount,
            wordlistWords: wordlistResult.data?.words ?? [],
            gamePlayerIds: (gamePlayers.data ?? []).map(gp => gp.user_id),
        }, db);

        activeGameInstances[currentGameId] = gameMode;

        // Emit start payload
        const startPayload = { success: true, gameId: currentGameId, roundId: currentRoundId, maskedWord, startTime, lives: gameMode.lives };
        socket.emit("game:start", startPayload);
        socket.to(currentGameId).emit("game:started", startPayload);
    } catch (err: unknown) {
        socket.emit("game:start", { success: false, error: err instanceof Error ? err.message : String(err) });
    }
};
