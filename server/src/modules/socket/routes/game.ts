import { z } from "zod";
import type { SocketRouteObject } from "../types/router.js";
import { supabase } from "../../app/lib/supabaseClient.js";
import {
  fetchUserActiveGameRound,
  fetchActiveRound,
  checkUserInGame,
  getRoundPlayer,
  markPlayerAsActive,
  getActivePlayersCount,
  markPlayerAsDisconnected,
  abandonGameAndRound,
} from "../../shared/utils/dbQueries.js";
import { Classic } from "../modes/SinglePlayer.js";
import { GameMode } from "../modes/defModes.js";
import type { GameInfo } from "../../shared/types/GameInfo.js";

// Global registry to persist active GameMode instances
export const activeGameInstances: Record<string, GameMode> = {};

const joinGamePayloadSchema = z.object({
  gameId: z.uuid("Invalid game ID. Must be a valid UUID string."),
});

const submitMovesPayloadSchema = z.object({
  moves: z.array(z.object({
    guess: z.string().length(1, "Guess must be a single letter.").regex(/^[a-zA-Z]$/, "Guess must be a letter."),
    timestamp: z.string().or(z.date()).transform((val) => new Date(val))
  }))
});

export const gameRoute: SocketRouteObject = {
  eventCategory: "game",
  functions: [
    {
      event: "join",
      auth: "required",
      rateLimit: "strict",
      zodSchema: joinGamePayloadSchema,
      handler: async (socket, payload) => {
        const { gameId } = payload as z.infer<typeof joinGamePayloadSchema>;
        const userId = socket.data.user.id;

        // 0. Check game is joinable (not abandoned or finished)
        const { data: gameStatus, error: gameStatusError } = await supabase
          .from("games")
          .select("status")
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

        // 1. Check if user is already in ANY other active game.

        const otherGameData = await fetchUserActiveGameRound(userId);

        if (otherGameData && otherGameData.length > 0) {
          socket.emit("game:join", {
            success: false,
            error: "You're already part of another active game.",
          });
          return;
        }

        // 2. Check if user is already a player in this specific game (for re-connections).
        // This is based on the `game_players` table, which tracks all players in a game.
        let existingPlayer;
        try {
          existingPlayer = await checkUserInGame(gameId, userId);
        } catch (playerCheckError: unknown) {
          socket.emit("game:join", {
            success: false,
            error: "Error checking game status: " + (playerCheckError instanceof Error ? playerCheckError.message : String(playerCheckError)),
          });
          return;
        }

        // If player is already in the game, it's a re-join.
        if (existingPlayer) {
          socket.join(gameId);

          // Find their ID in the current active round to populate socket.data
          const activeRounds = await fetchActiveRound(gameId);
          let roundPlayerId = null;

          if (activeRounds && activeRounds.length > 0) {
            const currentRound = activeRounds[0];
            try {
              const roundPlayer = await getRoundPlayer(currentRound.id, userId);

              if (roundPlayer) {
                roundPlayerId = roundPlayer.id;

                // Reset left_at to mark the user as active again
                await markPlayerAsActive(roundPlayerId);
              }
            } catch (err: unknown) {
              console.error("Error fetching/marking round player on reconnect:", err);
            }
          }

          socket.emit("game:join", {
            success: true,
            gameId: gameId,
            reconnected: true,
          });

          // Persist game/round info on the socket connection for future events
          socket.data.user.currentGameId = gameId;
          if (activeRounds && activeRounds.length > 0) {
            socket.data.user.currentRoundId = activeRounds[0].id;
          }
          socket.data.user.currentRoundPlayerId = roundPlayerId;
          return;
        }

        // If we're here, it's a NEW player joining this game.

        // 3. Fetch the active round for the game to join.
        const activeRounds = await fetchActiveRound(gameId);

        if (!activeRounds || activeRounds.length === 0) {
          socket.emit("game:join", {
            success: false,
            error: "Game not found or no active round available to join.",
          });
          return;
        }

        const roundToJoin = activeRounds[0];

        // 4. Add the player to the game's global player list (`game_players`)
        // and the current round's player list (`game_round_players`).
        // An RPC function would be ideal here for atomicity.

        const { error: gamePlayerInsertError } = await supabase
          .from("game_players")
          .insert({ game_id: gameId, user_id: userId });

        if (gamePlayerInsertError) {
          socket.emit("game:join", {
            success: false,
            error:
              "Failed to add player to game. " + gamePlayerInsertError.message,
          });
          return;
        }

        // Now add to the current round
        const { data: newRoundPlayer, error: roundPlayerInsertError } =
          await supabase
            .from("game_round_players")
            .insert({
              game_round_id: roundToJoin.id,
              user_id: userId,
            })
            .select("id")
            .single();

        if (roundPlayerInsertError) {
          // Rollback the `game_players` insert on failure.
          await supabase
            .from("game_players")
            .delete()
            .match({ game_id: gameId, user_id: userId });
          socket.emit("game:join", {
            success: false,
            error:
              "Failed to join game round. " + roundPlayerInsertError.message,
          });
          return;
        }

        if (newRoundPlayer) {
          socket.join(gameId);
          socket.emit("game:join", {
            success: true,
            gameId: gameId,
            reconnected: false,
          });

          socket.to(gameId).emit("game:player_joined", {
            userId: userId,
          });

          // Persist game/round info on the socket connection for future events
          socket.data.user.currentGameId = gameId;
          socket.data.user.currentRoundId = roundToJoin.id;
          socket.data.user.currentRoundPlayerId = newRoundPlayer.id; // ID of the player's entry in the round
        }
      },
    },
    {
      event: "start",
      auth: "required",
      rateLimit: "strict",
      handler: async (socket, payload) => {
        const userId = socket.data.user.id;
        const currentGameId = socket.data.user.currentGameId;

        if (!currentGameId) {
          socket.emit("game:start", {
            success: false,
            error: "You must join a game before starting it.",
          });
          return;
        }

        try {
          // 0. Guard against double-start
          if (activeGameInstances[currentGameId]) {
            socket.emit("game:start", {
              success: false,
              error: "This game has already been started.",
            });
            return;
          }

          // 1. Verify game ownership and get wordlist_id
          const { data: gameData, error: gameError } = await supabase
            .from("games")
            .select("created_by, mode_id, wordlist_id, total_lives")
            .eq("id", currentGameId)
            .single();

          if (gameError || !gameData) {
            socket.emit("game:start", {
              success: false,
              error: "Failed to fetch game details.",
            });
            return;
          }

          if (gameData.created_by !== userId) {
            socket.emit("game:start", {
              success: false,
              error: "Only the game owner can start the game.",
            });
            return;
          }

          // 2. Determine current round ID
          const currentRoundId = socket.data.user.currentRoundId;
          if (!currentRoundId) {
            socket.emit("game:start", {
              success: false,
              error: "No active round found. Please join the game properly.",
            });
            return;
          }

          // 3. Fetch appropriate game_metadata (players count)
          const playersCount = await getActivePlayersCount(currentRoundId);

          // 4. Validate with game mode
          // You could instantiate based on gameData.mode_id, but here we use SinglePlayer Classic explicitly
          const gameMode = new Classic(gameData.total_lives);

          // 5. Fetch the word from the existing round (word is set at game creation)
          const { data: roundData, error: roundFetchError } = await supabase
            .from("game_rounds")
            .select("word")
            .eq("id", currentRoundId)
            .single();

          if (roundFetchError || !roundData || !roundData.word) {
            socket.emit("game:start", { success: false, error: "Failed to load round data." });
            return;
          }

          gameMode.word = roundData.word;

          if (!gameMode.satisfies(playersCount)) {
            socket.emit("game:start", {
              success: false,
              error: `Game mode requirements not met. Current players: ${playersCount}, Required: ${gameMode.min_players} to ${gameMode.max_players} player(s).`,
            });
            return;
          }

          const startedAt = new Date().toISOString();

          // 6. Update game status to in_progress with started_at
          const { error: updateError } = await supabase
            .from("games")
            .update({ status: "in_progress", started_at: startedAt })
            .eq("id", currentGameId);

          if (updateError) {
            socket.emit("game:start", { success: false, error: "Failed to update game status." });
            return;
          }

          // 7. Update game_rounds: set started_at (word already set at creation)
          const { error: roundUpdateError } = await supabase
            .from("game_rounds")
            .update({ started_at: startedAt, status: "in_progress" })
            .eq("id", currentRoundId);

          if (roundUpdateError) {
            socket.emit("game:start", { success: false, error: "Failed to update round details." });
            return;
          }

          // Store the active instance
          activeGameInstances[currentGameId] = gameMode;

          // If everything is satisfied, we can emit the start event
          socket.to(currentGameId).emit("game:started", {
            success: true,
            gameId: currentGameId,
            timestamp: new Date().toISOString(),
          });

          socket.emit("game:start", {
            success: true,
            gameId: currentGameId,
          });
        } catch (err: unknown) {
          socket.emit("game:start", {
            success: false,
            error: "An error occurred while trying to start the game: " + (err instanceof Error ? err.message : String(err)),
          });
        }
      }
    },
    {
      event: "submit_moves",
      auth: "required",
      // Optional: adjust rate limit based on client's reporting frequency (e.g., 1 per second)
      rateLimit: "game_move",
      zodSchema: submitMovesPayloadSchema,
      handler: async (socket, payload) => {
        const userId = socket.data.user.id;
        const currentGameId = socket.data.user.currentGameId;

        if (!currentGameId) {
          socket.emit("game:submit_moves", { success: false, error: "Not in a game." });
          return;
        }

        const gameMode = activeGameInstances[currentGameId];
        if (!gameMode) {
          socket.emit("game:submit_moves", { success: false, error: "Game not started or instance lost." });
          return;
        }

        const { moves } = payload as z.infer<typeof submitMovesPayloadSchema>;

        try {
          const gameState: Partial<GameInfo> = { id: currentGameId };

          const { player, processedMoves, isWinner, isCorrectCompletion } = gameMode.processUserMoves(userId, moves, gameState);

          const currentRoundId = socket.data.user.currentRoundId;

          socket.emit("game:submit_moves", {
            success: true,
            timeTakenMs: player.timeTaken,
            move_set: player.move_set,
            lives: player.lives,
            completed: player.completed
          });

          const dbPromises: PromiseLike<unknown>[] = [];

          // Bulk insert valid moves into the database concurrently
          if (processedMoves.length > 0 && currentRoundId) {
            const movesToInsert = processedMoves.map((m: { guess: string, correct: boolean, timestamp: Date | string, move_index: number }) => ({
              round_id: currentRoundId,
              user_id: userId,
              move_index: m.move_index,
              guess: m.guess,
              correct: m.correct,
              created_at: typeof m.timestamp === 'string' ? m.timestamp : m.timestamp.toISOString()
            }));

            dbPromises.push(
              supabase.from("moves").insert(movesToInsert).then(({ error }) => {
                if (error) console.error("Failed to bulk insert moves:", error.message);
              })
            );
          }

          // Check if player completed the game/round
          if (isWinner || isCorrectCompletion || player.completed) {
            let roundEnded = false;
            let gameEnded = false;
            let finalResult = "lost";

            if (isWinner) {
              finalResult = "won";
              roundEnded = true;
            } else if (isCorrectCompletion) {
              finalResult = "completed"; // Restored as requested
            } else {
              finalResult = "lost";
              if (gameMode.max_players === 1) roundEnded = true;
            }

            if (currentRoundId) {
              dbPromises.push(
                supabase.from("game_round_players")
                  .update({ result: finalResult })
                  .eq("game_round_id", currentRoundId)
                  .eq("user_id", userId)
              );
            }

            if (isWinner) {
              const winEventPayload = { userId, timeTakenMs: player.timeTaken, word: gameMode.word };
              socket.to(currentGameId).emit("game:player_won", winEventPayload);
              socket.emit("game:player_won", winEventPayload);
            } else if (isCorrectCompletion) {
              socket.emit("game:player_completed", { userId, timeTakenMs: player.timeTaken });
            } else {
              socket.emit("game:player_lost", { userId, word: gameMode.word });
            }

            if (roundEnded) {
              // Finish current round
              if (currentRoundId) {
                dbPromises.push(
                  supabase.from("game_rounds")
                    .update({ status: "finished", finished_at: new Date().toISOString() })
                    .eq("id", currentRoundId)
                );
              }

              // Check if there's another round
              const { data: roundData } = await supabase.from("game_rounds").select("round_index").eq("id", currentRoundId).single();
              const { data: gameData } = await supabase.from("games").select("number_of_words, wordlist_id").eq("id", currentGameId).single();

              if (roundData && gameData && roundData.round_index < gameData.number_of_words) {
                // Instantly create next round
                const { data: wordlistData } = await supabase.from("wordlists").select("words").eq("id", gameData.wordlist_id).single();
                // Fetch already-used words to avoid repeats
                const { data: usedRounds } = await supabase.from("game_rounds").select("word").eq("game_id", currentGameId);
                const usedWords = new Set((usedRounds || []).map(r => r.word?.toLowerCase()));
                const available = (wordlistData?.words || []).filter((w: string) => !usedWords.has(w.toLowerCase()));
                const wordPool = available.length > 0 ? available : (wordlistData?.words || []);
                if (wordPool.length > 0) {
                  const newWord = wordPool[Math.floor(Math.random() * wordPool.length)];
                  const { data: newRound } = await supabase.from("game_rounds").insert({
                    game_id: currentGameId,
                    round_index: roundData.round_index + 1,
                    status: "in_progress", // start instantly
                    word: newWord,
                    started_at: new Date().toISOString()
                  }).select("id").single();

                  if (newRound) {
                    const otherSockets = await socket.in(currentGameId).fetchSockets();
                    const currentSockets = [...otherSockets, socket];
                    const newRoundPlayersToInsert: { game_round_id: string, user_id: string }[] = [];

                    const { data: gamePlayers } = await supabase.from("game_players").select("user_id").eq("game_id", currentGameId);
                    if (gamePlayers) {
                      for (const gp of gamePlayers) {
                        newRoundPlayersToInsert.push({ game_round_id: newRound.id, user_id: gp.user_id });
                      }
                      const { data: insertedPlayers } = await supabase.from("game_round_players").insert(newRoundPlayersToInsert).select("id, user_id");

                      if (insertedPlayers) {
                        const playerMap = Object.fromEntries(insertedPlayers.map(p => [p.user_id, p.id]));
                        for (const s of currentSockets) {
                          if (s.data && s.data.user) {
                            const uId = s.data.user.id;
                            if (playerMap[uId]) {
                              s.data.user.currentRoundId = newRound.id;
                              s.data.user.currentRoundPlayerId = playerMap[uId];
                            }
                          }
                        }
                      }
                    }

                    gameMode.resetRound(newWord);
                    const nextRoundPayload = { roundId: newRound.id, roundIndex: roundData.round_index + 1 };
                    socket.to(currentGameId).emit("game:next_round", nextRoundPayload);
                    socket.emit("game:next_round", nextRoundPayload);
                  } else {
                    gameEnded = true;
                  }
                } else {
                  gameEnded = true;
                }
              } else {
                gameEnded = true;
              }
            }

            if (gameEnded) {
              dbPromises.push(
                supabase.from("games")
                  .update({ status: "finished", finished_at: new Date().toISOString() })
                  .eq("id", currentGameId),
                supabase.from("game_players")
                  .update({ result: finalResult })
                  .eq("game_id", currentGameId)
                  .eq("user_id", userId)
              );
              delete activeGameInstances[currentGameId];
            }
          }

          await Promise.all(dbPromises);

        } catch (error: unknown) {
          socket.emit("game:submit_moves", { success: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
    },
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
          if (currentRoundPlayerId) {
            await markPlayerAsDisconnected(currentRoundPlayerId);
            const remaining_players = await getActivePlayersCount(currentRoundId!);

            if (remaining_players === 0) {
              await abandonGameAndRound(currentGameId, currentRoundId!);
              delete activeGameInstances[currentGameId];
            }
          }

          socket.to(currentGameId).emit("game:player_left", { userId });
          socket.leave(currentGameId);
          socket.emit("game:leave", { success: true });

          socket.data.user.currentGameId = undefined;
          socket.data.user.currentRoundId = undefined;
          socket.data.user.currentRoundPlayerId = undefined;
        } catch (err: unknown) {
          socket.emit("game:leave", {
            success: false,
            error: "Failed to leave game: " + (err instanceof Error ? err.message : String(err)),
          });
        }
      }
    }
  ],
};

export default gameRoute;
