import type { Request, Response } from "express";
import type { RouterObject } from "../types/router.js";
import { supabase } from "../lib/supabaseClient.js";
import {
  BadRequestError,
  NotFoundError,
} from "../../shared/errors/httpErrors.js";
import { z } from "zod";
import { gameSchema } from "../schemas/gameSchema.js";
import { fetchUserActiveGameRound } from "../../shared/utils/dbQueries.js";

/* GET home page. */
const gameRouter: RouterObject = {
  path: "/game",
  functions: [
    {
      method: "post",
      props: "/create",
      authorization: "required",
      rateLimit: "strict",
      keyType: "user",
      zodSchema: z.object({
        query: gameSchema,
      }),
      handler: async (req: Request, res: Response) => {
        const wordlist: string = res.locals.query.wordlistId;
        const mode: number = res.locals.query.gamemode;
        const lives: number = res.locals.query.lives;
        const numberOfWords: number = res.locals.query.numberOfWords;

        const { data: wordlistData, error: wordlistError } = await supabase
          .from("wordlists")
          .select("id, words")
          .eq("id", wordlist)
          .or(`is_public.eq.true,owner_id.eq.${req.user.id},default.eq.true`)
          .single();

        if (wordlistError) {
          throw new BadRequestError(wordlistError.message);
        }

        if (!wordlistData) {
          throw new NotFoundError("Wordlist not found");
        }

        const { data: gameMode, error: gameModeError } = await supabase
          .from("game_modes")
          .select("id")
          .eq("id", mode)
          .single();

        if (gameModeError) {
          throw new BadRequestError(gameModeError.message);
        }

        if (!gameMode) {
          throw new NotFoundError("Game mode not found");
        }

        const gameData = await fetchUserActiveGameRound(req.user.id);

        if (gameData.length > 0) {
          throw new BadRequestError("You're already part of an active game.");
        }

        const { data: newGame, error: newGameError } = await supabase
          .from("games")
          .insert({
            mode_id: mode,
            created_by: req.user.id,
            wordlist_id: wordlist,
            lives,
            number_of_words: numberOfWords,
          })
          .select("id")
          .single();

        if (newGameError || !newGame) {
          throw newGameError || new Error("Failed to create a new game.");
        }

        const { data: newRound, error: newRoundError } = await supabase
          .from("game_rounds")
          .insert({
            game_id: newGame.id,
            status: "in_progress",
            round_index: 1,
            word: wordlistData.words[
              Math.floor(Math.random() * wordlistData.words.length)
            ],
          })
          .select("id")
          .single();

        if (newRoundError || !newRound) {
          // If round creation fails, we should clean up the created game to avoid orphaned records.
          await supabase.from("games").delete().eq("id", newGame.id);
          throw (
            newRoundError || new Error("Failed to create a new game round.")
          );
        }
        res.status(201).json({ gameId: newGame.id });
      },
    },
  ],
};

export default gameRouter;
