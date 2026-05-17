import { z } from "zod";
import type { SocketRouteObject } from "../types/router.js";
import { supabase } from "../../app/lib/supabaseClient.js";
import {
  fetchUserActiveGameRound,
  fetchActiveRound,
} from "../../shared/utils/dbQueries.js";

const joinGamePayloadSchema = z.object({
  gameId: z.uuid("Invalid game ID. Must be a valid UUID string."),
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
        const { data: existingPlayer, error: playerCheckError } = await supabase
          .from("game_players")
          .select("id")
          .eq("game_id", gameId)
          .eq("user_id", userId)
          .maybeSingle();

        if (playerCheckError) {
          socket.emit("game:join", {
            success: false,
            error: "Error checking game status: " + playerCheckError.message,
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
            const { data: roundPlayer } = await supabase
              .from("game_round_players")
              .select("id")
              .eq("game_round_id", currentRound.id)
              .eq("user_id", userId)
              .maybeSingle();

            if (roundPlayer) {
              roundPlayerId = roundPlayer.id;
            }
          }

          socket.emit("game:join", {
            success: true,
            gameId: gameId,
            reconnected: true,
          });

          // Persist game/round info on the socket connection for future events
          socket.data.user.currentGameId = gameId;
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

          // Persist game/round info on the socket connection for future events
          socket.data.user.currentGameId = gameId;
          socket.data.user.currentRoundPlayerId = newRoundPlayer.id; // ID of the player's entry in the round
        }
      },
    },
  ],
};

export default gameRoute;
