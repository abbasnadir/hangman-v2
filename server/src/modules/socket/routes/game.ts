import { z } from "zod";
import type { SocketRouteObject } from "../types/router.js";
import { supabase } from "../../app/lib/supabaseClient.js";
import {
  abandonGameAndRound,
  checkUserInGame,
  getActivePlayersCount,
  getRoundPlayer,
  markPlayerAsActive,
  markPlayerAsDisconnected,
  insertMove,
  getWordlistWords,
  getUsedWordsInGame,
  insertNewRound,
  getGamePlayers,
  insertRoundPlayers,
  finishGameRound,
  finishGame,
  updateGamePlayerResult,
  updateRoundPlayerResult,
  fetchUserActiveGameRound,
  fetchActiveRound,
} from "../../shared/utils/dbQueries.js";
import { Classic } from "../modes/SinglePlayer.js";
import { Multiplayer } from "../modes/Multiplayer.js";
import { GameMode, type DbFunctions } from "../modes/defModes.js";
import { joinGamePayloadSchema, submitMovePayloadSchema } from "../schemas/gameProcessSchema.js";

// ─── Global in-memory game registry ─────────────────────────────────────────
export const activeGameInstances: Record<string, GameMode> = {};

// ─── DB function bag — injected into GameMode methods ────────────────────────
const db: DbFunctions = {
  insertMove,
  getWordlistWords,
  getUsedWordsInGame,
  insertNewRound,
  getGamePlayers,
  insertRoundPlayers,
  finishGameRound,
  finishGame,
  updateGamePlayerResult,
  updateRoundPlayerResult,
  abandonGameAndRound,
  markPlayerAsDisconnected,
  getActivePlayersCount,
  async getProfile(userId) {
    const { data } = await supabase
      .from("profiles")
      .select("username, pfp")
      .eq("id", userId)
      .single();
    return data ?? null;
  },
  async updateGameStatus(gameId, status, startedAt) {
    await supabase.from("games").update({ status, started_at: startedAt }).eq("id", gameId);
  },
  async updateRoundStatus(roundId, status, startedAt) {
    await supabase.from("game_rounds").update({ status, started_at: startedAt }).eq("id", roundId);
  },
};

// ─── Route ───────────────────────────────────────────────────────────────────
export const gameRoute: SocketRouteObject = {
  eventCategory: "game",
  functions: [

    // ── JOIN ─────────────────────────────────────────────────────────────────
    // Validates the game exists, the user isn't in another game, handles
    // reconnection, and inserts new players into the DB. This is room/DB
    // management, not game logic, so it stays in the route.
    {
      event: "join",
      auth: "required",
      rateLimit: "strict",
      zodSchema: joinGamePayloadSchema,
      handler: async (socket, payload) => {
        const { gameId } = payload as z.infer<typeof joinGamePayloadSchema>;
        const userId = socket.data.user.id;

        // 1. Game must exist and be joinable
        const { data: gameStatus, error: gameStatusError } = await supabase
          .from("games")
          .select("status, mode_id, created_by")
          .eq("id", gameId)
          .single();

        if (gameStatusError || !gameStatus) {
          socket.emit("game:join", { success: false, error: "Game not found." });
          return;
        }
        if (gameStatus.status === "abandoned" || gameStatus.status === "finished") {
          socket.emit("game:join", { success: false, error: "This game is no longer active." });
          return;
        }

        const isHost = gameStatus.created_by === userId;
        const modeId = gameStatus.mode_id;

        // 2. User must not be in a different active game
        const otherGames = await fetchUserActiveGameRound(userId);
        if (otherGames && otherGames.length > 0) {
          const rounds: any = otherGames[0]?.game_rounds;
          const activeGameId = Array.isArray(rounds) ? rounds[0]?.game_id : rounds?.game_id;
          if (activeGameId && activeGameId !== gameId) {
            socket.emit("game:join", { success: false, error: "You're already in another active game." });
            return;
          }
        }

        // 3. Handle reconnecting player
        const existingPlayer = await checkUserInGame(gameId, userId).catch(e => {
          console.error("checkUserInGame:", e);
          return null;
        });

        if (existingPlayer) {
          socket.join(gameId);
          const activeRounds = await fetchActiveRound(gameId);

          if (activeRounds && activeRounds.length > 0) {
            const round = activeRounds[0];
            const roundPlayer = await getRoundPlayer(round.id, userId).catch(() => null);
            if (roundPlayer) await markPlayerAsActive(roundPlayer.id).catch(console.error);

            socket.data.user.currentGameId = gameId;
            socket.data.user.currentRoundId = round.id;
            socket.data.user.currentRoundPlayerId = roundPlayer?.id ?? null;
          }

          socket.emit("game:join", { success: true, gameId, reconnected: true, isHost, modeId });
          return;
        }

        // 4. New player — find the active round to join
        const activeRounds = await fetchActiveRound(gameId);
        if (!activeRounds || activeRounds.length === 0) {
          socket.emit("game:join", { success: false, error: "No active round available to join." });
          return;
        }
        const roundToJoin = activeRounds[0];

        // 5. Insert player into game_players and game_round_players
        const { error: gpError } = await supabase
          .from("game_players")
          .insert({ game_id: gameId, user_id: userId });

        if (gpError) {
          socket.emit("game:join", { success: false, error: "Failed to join game: " + gpError.message });
          return;
        }

        const { data: newRoundPlayer, error: rpError } = await supabase
          .from("game_round_players")
          .insert({ game_round_id: roundToJoin.id, user_id: userId })
          .select("id")
          .single();

        if (rpError || !newRoundPlayer) {
          await supabase.from("game_players").delete().match({ game_id: gameId, user_id: userId });
          socket.emit("game:join", { success: false, error: "Failed to join round: " + rpError?.message });
          return;
        }

        // Set synchronously to prevent race conditions
        socket.data.user.currentGameId = gameId;
        socket.data.user.currentRoundId = roundToJoin.id;
        socket.data.user.currentRoundPlayerId = newRoundPlayer.id;

        socket.join(gameId);

        const playersCount = await getActivePlayersCount(roundToJoin.id);
        socket.emit("game:join", { success: true, gameId, reconnected: false, isHost, modeId, playersCount });
        socket.to(gameId).emit("game:player_joined", { userId, playersCount });
      },
    },

    // ── START ────────────────────────────────────────────────────────────────
    // Validates ownership and player count, then delegates all initialization
    // (state setup + DB status update) to gameMode.initialize().
    {
      event: "start",
      auth: "required",
      rateLimit: "strict",
      handler: async (socket) => {
        const userId = socket.data.user.id;
        const currentGameId = socket.data.user.currentGameId;
        const currentRoundId = socket.data.user.currentRoundId;

        if (!currentGameId) {
          socket.emit("game:start", { success: false, error: "You must join a game before starting it." });
          return;
        }
        if (activeGameInstances[currentGameId]) {
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

          // Fetch round word + player count in parallel
          const [roundData, playersCount] = await Promise.all([
            supabase.from("game_rounds").select("word, round_index").eq("id", currentRoundId).single(),
            getActivePlayersCount(currentRoundId),
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
          }, db);

          activeGameInstances[currentGameId] = gameMode;

          // Emit start payload
          const startPayload = { success: true, gameId: currentGameId, roundId: currentRoundId, maskedWord, startTime };
          socket.emit("game:start", startPayload);
          socket.to(currentGameId).emit("game:started", startPayload);
        } catch (err: unknown) {
          socket.emit("game:start", { success: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },

    // ── SUBMIT MOVE ──────────────────────────────────────────────────────────
    // Validates the user is in a game, then delegates EVERYTHING to
    // gameMode.onMoveSubmitted(). The route just emits the returned payloads.
    {
      event: "submit_move",
      auth: "required",
      rateLimit: "game_move",
      zodSchema: submitMovePayloadSchema,
      handler: async (socket, payload) => {
        const userId = socket.data.user.id;
        const currentGameId = socket.data.user.currentGameId;
        const currentRoundId = socket.data.user.currentRoundId;

        if (!currentGameId) {
          socket.emit("game:submit_move", { success: false, error: "Not in a game." });
          return;
        }
        const gameMode = activeGameInstances[currentGameId];
        if (!gameMode) {
          socket.emit("game:submit_move", { success: false, error: "Game not started or session lost." });
          return;
        }
        if (!currentRoundId) {
          socket.emit("game:submit_move", { success: false, error: "No active round." });
          return;
        }

        try {
          const move = payload as z.infer<typeof submitMovePayloadSchema>;

          // Delegate everything to GameMode
          const { moveResponse, finishResult } = await gameMode.onMoveSubmitted(
            userId, move, currentGameId, currentRoundId, db, () => socket.connected
          );

          // Emit move response to this player
          socket.emit("game:submit_move", moveResponse);

          // If the player finished, emit all finish-related events
          if (finishResult) {
            socket.emit(finishResult.playerEvent.name, finishResult.playerEvent.payload);
            socket.to(currentGameId).emit("game:player_finished_broadcast", finishResult.broadcastPayload);

            if (finishResult.roundEnded) {
              if (finishResult.nextRound) {
                // Patch socket.data for all sockets in the room with new round IDs
                const allSockets = [...await socket.in(currentGameId).fetchSockets(), socket];
                for (const s of allSockets) {
                  const uid = s.data?.user?.id;
                  if (uid && finishResult.nextRound.playerMap[uid]) {
                    s.data.user.currentRoundId = finishResult.nextRound.id;
                    s.data.user.currentRoundPlayerId = finishResult.nextRound.playerMap[uid];
                  }
                }
                const newRoundPayload = { maskedWord: finishResult.nextRound.maskedWord, startTime: finishResult.nextRound.startTime };
                socket.to(currentGameId).emit("game:new_round_ready", newRoundPayload);
                socket.emit("game:new_round_ready", newRoundPayload);

              } else if (finishResult.gameFullyEnded) {
                delete activeGameInstances[currentGameId];
                socket.to(currentGameId).emit("game:fully_completed", { success: true });
                socket.emit("game:fully_completed", { success: true });
              }
            }
          }
        } catch (error: unknown) {
          socket.emit("game:submit_move", { success: false, error: error instanceof Error ? error.message : String(error) });
        }
      },
    },

    // ── LEAVE ────────────────────────────────────────────────────────────────
    // Validates the user is in a game, then delegates cleanup to
    // gameMode.onPlayerLeave() (or falls back to direct DB calls if
    // the game hasn't started yet).
    {
      event: "leave",
      auth: "required",
      rateLimit: "strict",
      handler: async (socket) => {
        const userId = socket.data.user.id;
        const currentGameId = socket.data.user.currentGameId;
        const currentRoundId = socket.data.user.currentRoundId;
        const currentRoundPlayerId = socket.data.user.currentRoundPlayerId;

        if (!currentGameId) {
          socket.emit("game:leave", { success: false, error: "Not in a game." });
          return;
        }

        try {
          if (currentRoundPlayerId && currentRoundId) {
            const gameMode = activeGameInstances[currentGameId];
            if (gameMode) {
              // Game is active — delegate cleanup to GameMode
              const { gameAbandoned } = await gameMode.onPlayerLeave(
                currentRoundPlayerId, currentRoundId, currentGameId, db
              );
              if (gameAbandoned) delete activeGameInstances[currentGameId];
            } else {
              // Game hasn't started yet — clean up directly via DB
              await markPlayerAsDisconnected(currentRoundPlayerId);
              const remaining = await getActivePlayersCount(currentRoundId);
              if (remaining === 0) {
                await abandonGameAndRound(currentGameId, currentRoundId);
              }
            }
          }

          socket.to(currentGameId).emit("game:player_left", { userId });
          socket.leave(currentGameId);
          socket.emit("game:leave", { success: true });

          socket.data.user.currentGameId = undefined;
          socket.data.user.currentRoundId = undefined;
          socket.data.user.currentRoundPlayerId = undefined;
        } catch (err: unknown) {
          socket.emit("game:leave", { success: false, error: err instanceof Error ? err.message : String(err) });
        }
      },
    },
  ],
};

export default gameRoute;
