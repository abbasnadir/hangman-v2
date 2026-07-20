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
        const lives: number = res.locals.query.totalLives;
        const numberOfWords: number = res.locals.query.number_of_words;

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

        // Cleanup old inactive games (status = 'created' but never joined)
        const { data: staleGames } = await supabase
          .from("games")
          .select("id")
          .eq("created_by", req.user.id)
          .eq("status", "created");
        
        if (staleGames && staleGames.length > 0) {
          const staleIds = staleGames.map(g => g.id);
          await supabase.from("game_rounds").delete().in("game_id", staleIds);
          await supabase.from("games").delete().in("id", staleIds);
        }

        const gameData = await fetchUserActiveGameRound(req.user.id);

        if (gameData.length > 0) {
          // @ts-ignore - dynamic join properties
          const existingGameId = gameData[0].game_rounds.game_id;
          res.status(400).json({
            error: {
              code: "ACTIVE_GAME_EXISTS",
              message: "You're already part of an active game.",
              activeGameId: existingGameId
            }
          });
          return;
        }

        const { data: newGame, error: newGameError } = await supabase
          .from("games")
          .insert({
            mode_id: mode,
            created_by: req.user.id,
            wordlist_id: wordlist,
            total_lives: lives,
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
            round_index: 1,
            word: wordlistData.words[
              Math.floor(Math.random() * wordlistData.words.length)
            ],
            status: 'in_progress'
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
      }
    },
    {
      method: "post",
      props: "/abandon",
      authorization: "required",
      rateLimit: "strict",
      keyType: "user",
      handler: async (req: Request, res: Response) => {
        const userId = req.user.id;
        const gameId = req.body?.gameId || req.query?.gameId;

        if (!gameId) {
          throw new BadRequestError("gameId is required");
        }

        // Verify the user is actually in this game
        const { data: playerRecord } = await supabase
          .from("game_players")
          .select("id")
          .eq("game_id", gameId)
          .eq("user_id", userId)
          .maybeSingle();

        if (!playerRecord) {
          throw new NotFoundError("You are not a player in this game");
        }

        // Abandon the single in_progress round for this game
        const { data: activeRound } = await supabase
          .from("game_rounds")
          .select("id")
          .eq("game_id", gameId)
          .eq("status", "in_progress")
          .maybeSingle();

        if (activeRound) {
          // Mark all round players as disconnected
          await supabase
            .from("game_round_players")
            .update({ left_at: new Date().toISOString(), result: "abandoned" })
            .eq("game_round_id", activeRound.id)
            .is("result", null);

          await supabase
            .from("game_rounds")
            .update({ status: "abandoned", finished_at: new Date().toISOString() })
            .eq("id", activeRound.id);
        }

        // Abandon the game itself
        await supabase
          .from("games")
          .update({ status: "abandoned", finished_at: new Date().toISOString() })
          .eq("id", gameId)
          .in("status", ["created", "in_progress"]);

        // Mark game_players as abandoned if no result yet
        await supabase
          .from("game_players")
          .update({ result: "abandoned" })
          .eq("game_id", gameId)
          .is("result", null);

        res.json({ success: true });
      }
    },
  ],
};

export default gameRouter;
