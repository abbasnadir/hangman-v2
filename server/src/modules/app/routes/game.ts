import type { Request, Response } from "express";
import type { RouterObject } from "../types/router.js";
import { supabase } from "../lib/supabaseClient.js";
import { BadRequestError, NotFoundError } from "../../shared/errors/httpErrors.js";

/* GET home page. */
const gameRouter: RouterObject = {
  path: "/game",
  functions: [
    {
      method: "get",
      props: "/create",
      authorization: "required",
      rateLimit: "strict",
      keyType: "user",
      handler: async (req: Request, res: Response) => {
        const { data: user, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", req.user.id)
          .is("deleted_at", null)
          .single();

        if (error || !user) {
          throw new NotFoundError("User not found or deleted");
        }

        const { data: gameData, error: gameError } = await supabase
          .from("game_round_players")
          .select(
            `
                game_round_id,
                game_rounds!inner(status)
            `,
          )
          .eq("user_id", req.user.id)
          .is("left_at", null)
          .eq("game_rounds.status", "in_progress")
          .limit(1);

        if (gameError) {
          throw gameError;
        }

        if (gameData.length > 0) {
          throw new BadRequestError("You're already part of an active game.");
        }

        const { data: newGame, error: newGameError } = await supabase
          .from("game_rounds")
          .insert({
            status: "in_progress",
          })
          .select("id")
          .single();

        if (newGameError || !newGame) {
          throw newGameError || new Error("Failed to create a new game.");
        }

        res.status(201).json({ gameId: newGame.id });
      },
    },
  ],
};

export default gameRouter;
