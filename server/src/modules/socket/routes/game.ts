import { z } from "zod";
import type { SocketRouteObject } from "../types/router.js";
import { supabase } from "../../app/lib/supabaseClient.js";
import fetchUserActiveGameRound from "../../shared/utils/dbQueries.js";

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
        const parsedPayload = payload as z.infer<typeof joinGamePayloadSchema>;

        const { data: user, error } = await supabase
          .from("users")
          .select("id")
          .eq("id", socket.data.user.id)
          .is("deleted_at", null)
          .single();

        if (error) {
          socket.emit("game:join", {
            success: false,
            error: error.message,
          });
          return;
        }

        if (!user) {
          socket.emit("game:join", {
            success: false,
            error: "Invalid user",
          });
          return;
        }

        const { data: game, error: gameError } = await supabase
          .from("games")
          .select("id")
          .eq("id", parsedPayload.gameId)
          .single();

        if (gameError) {
          socket.emit("game:join", {
            success: false,
            error: gameError.message,
          });
          return;
        }

        if (!game) {
          socket.emit("game:join", {
            success: false,
            error: "Game not found",
          });
          return;
        }

        const gameData = await fetchUserActiveGameRound(user.id);

        if (gameData.length > 0) {
          socket.emit("game:join", {
            success: false,
            error: "You're already part of an active game.",
          });
          return;
        }

        const { data: currentRound, error: roundError } = await supabase
          .from("rounds")
          .insert({
            game_id: parsedPayload.gameId,
            user_id: user.id,
          })
          .select("id")
          .eq("game_id", parsedPayload.gameId)
          .is("ended_at", null)
          .single();

        const { data: gameInstance, error: instanceError } = await supabase
          .from("rounds")
          .insert({
            game_id: parsedPayload.gameId,
            user_id: user.id,
          })
          .select("id")
          .eq("game_id", parsedPayload.gameId)
          .is("ended_at", null)
          .single();

        if (roundError) {
          socket.emit("game:join", {
            success: false,
            error: roundError.message,
          });
          return;
        }

        if (currentRound) {
          socket.join(parsedPayload.gameId);
          socket.emit("game:join", {
            success: true,
            gameId: parsedPayload.gameId,
          });
        }

        socket.data.user.currentGameId = parsedPayload.gameId;
        socket.data.user.currentRoundId = currentRound.id;
      },
    },
  ],
};

export default gameRoute;
