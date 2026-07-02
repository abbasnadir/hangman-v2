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
  updateRoundPlayerResult,
  finishGameRound,
  finishGame,
  updateGamePlayerResult,
  getWordlistWords,
  getUsedWordsInGame,
  insertNewRound,
  getGamePlayers,
  insertRoundPlayers,
  fetchUserActiveGameRound,
  fetchActiveRound,
} from "../../shared/utils/dbQueries.js";
import { Classic } from "../modes/SinglePlayer.js";
import { GameMode } from "../modes/defModes.js";
import type { GameInfo } from "../../shared/types/GameInfo.js";
import { joinGamePayloadSchema, submitMovePayloadSchema } from "../schemas/gameProcessSchema.js";

// Global registry to persist active GameMode instances
export const activeGameInstances: Record<string, GameMode> = {};

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

          const gameRounds: any = otherGameData[0]?.game_rounds;
          const activeGameId = Array.isArray(gameRounds) ? gameRounds[0]?.game_id : gameRounds?.game_id;

          if (activeGameId && activeGameId !== gameId) {
            socket.emit("game:join", {
              success: false,
              error: "You're already part of another active game.",
            });
            return;
          }
        }

        // 2. Check if user is already a player in this specific game (for re-connections).
        // This is based on the `game_players` table, which tracks all players in a game.
        let existingPlayer;

        try {
          existingPlayer = await checkUserInGame(gameId, userId);
        } catch (error) {
          console.error("Error checking existing player:", error);
          socket.emit("game:join", {
            success: false,
            error: "Failed to verify game status.",
          });
          return;
        }

        // 3. If they are an existing player, fetch the *active round* of this game.
        // If there's an active round, see if they are part of it.
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
            .select("created_by, mode_id, wordlist_id, total_lives, number_of_words")
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
          const gameMode: Classic = new Classic(gameData.total_lives);

          const { data: roundData, error: roundFetchError } = await supabase
            .from("game_rounds")
            .select("word, round_index")
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
          gameMode.startedAt = Date.now(); // Start the global clock precisely now!
          gameMode.resetRound(roundData.word);

          // Cache game configuration in memory for immediate access
          gameMode.numberOfWords = gameData.number_of_words;
          gameMode.wordlistId = gameData.wordlist_id;
          gameMode.roundIndex = roundData.round_index;

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
            roundId: currentRoundId,
            maskedWord: gameMode.getMaskedWord(userId),
            startTime: gameMode.startedAt
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
      event: "submit_move",
      auth: "required",
      rateLimit: "game_move",
      zodSchema: submitMovePayloadSchema,
      handler: async (socket, payload) => {
        const userId = socket.data.user.id;
        const currentGameId = socket.data.user.currentGameId;

        if (!currentGameId) {
          socket.emit("game:submit_move", { success: false, error: "Not in a game." });
          return;
        }

        const gameMode = activeGameInstances[currentGameId];
        if (!gameMode) {
          socket.emit("game:submit_move", { success: false, error: "Game not started or instance lost." });
          return;
        }

        const move = payload as z.infer<typeof submitMovePayloadSchema>;

        try {
          const gameState: Partial<GameInfo> = { id: currentGameId };

          const { player, processedMove, isWinner, isCorrectCompletion } = gameMode.processMove(userId, move, gameState);

          const currentRoundId = socket.data.user.currentRoundId;

          socket.emit("game:submit_move", {
            success: true,
            timeTakenMs: player.getTimeTaken(gameMode.startedAt),
            move_set: player.move_set,
            lives: player.lives,
            completed: player.completed,
            maskedWord: gameMode.getMaskedWord(userId)
          });

          const dbPromises: PromiseLike<unknown>[] = [];

          // Insert the valid move into the database asynchronously
          if (processedMove && currentRoundId) {
            const moveToInsert = {
              round_id: currentRoundId,
              user_id: userId,
              move_index: processedMove.move_index,
              guess: processedMove.guess,
              correct: processedMove.correct,
              created_at: typeof processedMove.timestamp === 'string' ? processedMove.timestamp : processedMove.timestamp.toISOString()
            };

            dbPromises.push(
              insertMove(moveToInsert).catch(error => console.error("Failed to insert move:", error.message))
            );
          }

          // Check if player completed the game/round
          if (isWinner || isCorrectCompletion || player.completed) {
            let roundEnded = false;
            let gameEnded = false;
            let hasNextRound = false;
            let finalResult = "lost";

            if (isWinner) {
              finalResult = "won";
            } else if (isCorrectCompletion) {
              finalResult = "completed";
            } else {
              finalResult = "lost";
            }

            // Round is only over when ALL players have completed.
            roundEnded = gameMode.completedPlayersCount >= Object.keys(gameMode.players).length;

            // Update round player result in DB
            if (currentRoundId) {
              dbPromises.push(
                updateRoundPlayerResult(currentRoundId, userId, finalResult)
                  .catch(e => console.error(e.message))
              );
            }

            let previousWord = gameMode.word;
            let previousTimeTakenMs = player.getTimeTaken(gameMode.startedAt);

            const currentRoundIndex = (gameMode as any).roundIndex;
            const totalWords = (gameMode as any).numberOfWords;

            if (currentRoundIndex < totalWords) {
              hasNextRound = true;
            } else {
              gameEnded = true;
            }

            // NOW emit client events IMMEDIATELY for THIS player
            if (hasNextRound) {
              const nextRoundPayload = {
                roundResult: finalResult,
                word: previousWord,
                timeTakenMs: previousTimeTakenMs,
              };
              socket.emit("game:next_round", nextRoundPayload);
            } else {
              // Final round — emit the terminal event for THIS player
              if (finalResult === "won") {
                const winPayload = { userId, timeTakenMs: previousTimeTakenMs, word: previousWord };
                socket.emit("game:player_won", winPayload);
              } else if (finalResult === "completed") {
                socket.emit("game:player_completed", { userId, timeTakenMs: previousTimeTakenMs });
              } else {
                socket.emit("game:player_lost", { userId, word: previousWord });
              }
            }

            // Perform DB updates in the background without blocking the client response
            if (roundEnded) {
              // Now we advance the game mode round index
              if (hasNextRound) {
                (gameMode as any).roundIndex = currentRoundIndex + 1;
              }

              if (currentRoundId) {
                dbPromises.push(
                  finishGameRound(currentRoundId).catch(err => console.error("Failed to finish current round:", err.message))
                );
              }

              if (hasNextRound) {
                // Check socket still connected before creating next round
                if (!socket.connected) {
                  console.log("[next_round] Socket disconnected during round transition, abandoning");
                  await abandonGameAndRound(currentGameId, currentRoundId!);
                  delete activeGameInstances[currentGameId];
                  await Promise.all(dbPromises);
                  return;
                }

                try {
                  const wordlistId = (gameMode as any).wordlistId;
                  const words = await getWordlistWords(wordlistId);
                  const usedWords = await getUsedWordsInGame(currentGameId);
                  const available = words.filter((w: string) => !usedWords.has(w.toLowerCase()));
                  const wordPool = available.length > 0 ? available : words;

                  if (wordPool.length > 0) {
                    const newWord = wordPool[Math.floor(Math.random() * wordPool.length)];

                    // Check socket AGAIN right before DB commit
                    if (!socket.connected) {
                      console.log("[next_round] Socket disconnected before round insert, abandoning");
                      await abandonGameAndRound(currentGameId, currentRoundId!);
                      delete activeGameInstances[currentGameId];
                      await Promise.all(dbPromises);
                      return;
                    }

                    const newRound = await insertNewRound(currentGameId, (gameMode as any).roundIndex, newWord);

                    if (newRound) {
                      const gamePlayers = await getGamePlayers(currentGameId);

                      if (gamePlayers) {
                        const newRoundPlayersToInsert = gamePlayers.map(gp => ({ game_round_id: newRound.id, user_id: gp.user_id }));
                        const insertedPlayers = await insertRoundPlayers(newRoundPlayersToInsert);

                        if (insertedPlayers) {
                          // If socket disconnected after insert, clean up the orphan immediately
                          if (!socket.connected) {
                            console.log("[next_round] Socket disconnected after round insert, cleaning up orphan");
                            for (const ip of insertedPlayers) {
                              await markPlayerAsDisconnected(ip.id);
                            }
                            await abandonGameAndRound(currentGameId, newRound.id);
                            delete activeGameInstances[currentGameId];
                            await Promise.all(dbPromises);
                            return;
                          }

                          const playerMap = Object.fromEntries(insertedPlayers.map(p => [p.user_id, p.id]));
                          const otherSockets = await socket.in(currentGameId).fetchSockets();
                          const currentSockets = [...otherSockets, socket];
                          for (const s of currentSockets) {
                            if (s.data?.user) {
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

                      // Send the actual round details to the client
                      const newRoundPayload = {
                        maskedWord: gameMode.getMaskedWord(undefined),
                        startTime: Date.now()
                      };
                      socket.to(currentGameId).emit("game:new_round_ready", newRoundPayload);
                      socket.emit("game:new_round_ready", newRoundPayload);
                    } else {
                      // fallback if failed to create round
                    }
                  } else {
                    // fallback if wordpool empty
                  }
                } catch (err: any) {
                  console.error("FATAL ERROR IN NEXT ROUND LOGIC:", err);
                }
              }
            }

            if (gameEnded && roundEnded) {
              dbPromises.push(
                finishGame(currentGameId).catch(err => console.error(err)),
                updateGamePlayerResult(currentGameId, userId, finalResult).catch(err => console.error(err))
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
