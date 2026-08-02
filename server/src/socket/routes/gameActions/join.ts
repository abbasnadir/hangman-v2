import { z } from "zod";
import type { Socket } from "socket.io";

import {
  checkUserInGame,
  fetchUserActiveGameRound,
  fetchActiveRound,
  fetchGameStatus,
  getProfile
} from "../../../shared/utils/dbQueries.js";
import { Classic } from "../../game/modes/Classic/index.js";
import { Multiplayer } from "../../game/modes/Multiplayer/index.js";
import type { GameMode } from "../../game/core/GameMode.js";
import { joinGamePayloadSchema } from "../../schemas/gameProcessSchema.js";
import { activeGameInstances } from "../../game/core/registry.js";

/**
 * Handles the "game:join" socket event.
 * 
 * Flow:
 * 1. Fetches game and round status from the database.
 * 2. Checks if the game is active and if the user is already playing elsewhere.
 * 3. Prevents duplicate tabs (multiple sockets) from the same user joining.
 * 4. Initializes the appropriate GameMode (Classic or Multiplayer) if it isn't in memory yet.
 * 5. Delegates the rest of the joining logic to the specific game mode via `handleJoin`.
 */
export const joinHandler = async (socket: Socket, payload: unknown) => {
    const { gameId } = payload as z.infer<typeof joinGamePayloadSchema>;
    const userId = socket.data.user.id;

    const profilePromise = !socket.data.user.username 
        ? getProfile(userId).then(p => ({ data: p }))
        : Promise.resolve({ data: null });

    const gameStatusPromise = fetchGameStatus(gameId);

    const otherGamesPromise = fetchUserActiveGameRound(userId);
    const existingPlayerPromise = checkUserInGame(gameId, userId).catch(e => {
        console.error("checkUserInGame:", e);
        return null;
    });
    const activeRoundsPromise = fetchActiveRound(gameId);

    const [
        { data: profile },
        { data: gameStatus, error: gameStatusError },
        otherGames,
        existingPlayer,
        activeRounds
    ] = await Promise.all([
        profilePromise,
        gameStatusPromise,
        otherGamesPromise,
        existingPlayerPromise,
        activeRoundsPromise
    ]);

    if (profile) {
        socket.data.user.username = profile.username ?? "Player";
        socket.data.user.pfp = profile.pfp ?? "";
    }

    // 1. Game must exist and be joinable
    if (gameStatusError || !gameStatus) {
        socket.emit("game:join", { success: false, error: "Game not found." });
        return;
    }
    if (gameStatus.status === "abandoned" || gameStatus.status === "finished") {
        socket.emit("game:join", { success: false, error: "This game is no longer active." });
        return;
    }

    // 2. User must not be in a different active game
    if (otherGames && otherGames.length > 0) {
        const rounds: any = otherGames[0]?.game_rounds;
        const activeGameId = Array.isArray(rounds) ? rounds[0]?.game_id : rounds?.game_id;
        if (activeGameId && activeGameId !== gameId) {
            socket.emit("game:join", { success: false, error: "You're already in another active game." });
            return;
        }
    }

    // Prevent multiple tabs for the same user in the same game
    const existingGameSockets = await (socket as any).server.in(gameId).fetchSockets();
    const isUserAlreadyInGame = existingGameSockets.some((s: any) => s.data?.user?.id === userId && s.id !== socket.id);
    if (isUserAlreadyInGame) {
        socket.emit("game:join", { success: false, error: "You are already playing this game in another tab. Please close this tab." });
        return;
    }

    // 3. Delegate to mode specific handler
    const modeId = gameStatus.mode_id;
    let gameMode = activeGameInstances[gameId];
    if (!gameMode) {
        gameMode = modeId === 2 ? new Multiplayer(gameStatus.total_lives) : new Classic(gameStatus.total_lives);
        gameMode.createdBy = gameStatus.created_by;
        gameMode.numberOfWords = gameStatus.number_of_words;
        gameMode.wordlistId = gameStatus.wordlist_id;
        // Do not add to activeGameInstances yet, handleJoin will do it once joined successfully
    }

    const dbData = {
        gameStatus,
        existingPlayer,
        activeRounds
    };

    await (gameMode as any).handleJoin(socket, gameId, userId, dbData);
};
