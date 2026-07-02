import type { Request, Response } from "express";
import type { RouterObject } from "../types/router.js";
import { supabase } from "../lib/supabaseClient.js";
import { z } from "zod";
import { BadRequestError } from "../../shared/errors/httpErrors.js";

const logsRouter: RouterObject = {
  path: "/logs",
  functions: [
    {
      method: "get",
      props: "/",
      authorization: "required",
      rateLimit: "read",
      keyType: "user",
      zodSchema: z.object({
        query: z.object({
          page: z.coerce.number().int().min(1).optional().default(1),
          limit: z.coerce.number().int().min(1).max(50).optional().default(10),
          search: z.string().optional(),
        }),
      }),
      handler: async (req: Request, res: Response) => {
        const page = res.locals.query.page as number;
        const limit = res.locals.query.limit as number;
        const search = res.locals.query.search as string | undefined;

        const offset = (page - 1) * limit;

        const { data, error, count } = await supabase
          .from("games")
          .select(`
            id,
            mode_id,
            total_lives,
            created_at,
            number_of_words,
            game_players!inner (
              user_id,
              result
            ),
            game_rounds!inner (
              id,
              word,
              started_at,
              finished_at,
              round_index,
              game_round_players!inner (
                user_id,
                result,
                joined_at,
                left_at
              )
            )
          `, { count: "exact" })
          .eq("game_players.user_id", req.user.id)
          .eq("game_rounds.game_round_players.user_id", req.user.id)
          .ilike("game_rounds.word", search ? `%${search}%` : "%")
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) {
          throw new BadRequestError(error.message);
        }

        // Gather all round IDs across all returned games to fetch moves
        const allRoundIds = data.flatMap((g: any) => g.game_rounds.map((r: any) => r.id));
        let movesData: any[] = [];

        if (allRoundIds.length > 0) {
          const { data: mData, error: mError } = await supabase
            .from("moves")
            .select("round_id, correct")
            .in("round_id", allRoundIds)
            .eq("user_id", req.user.id)
            .eq("correct", false);

          if (!mError && mData) {
            movesData = mData;
          }
        }

        // Format data to match new frontend expectations
        const formattedLogs = data.map((game: any) => {
          const gamePlayerInfo = game.game_players[0]; // Exactly one because of inner eq

          const rounds = game.game_rounds.map((round: any) => {
            const roundPlayerInfo = round.game_round_players[0];
            const usedLives = movesData.filter((m: any) => m.round_id === round.id).length;
            
            let timeTakenMs = 0;
            if (round.started_at && round.finished_at) {
              timeTakenMs = new Date(round.finished_at).getTime() - new Date(round.started_at).getTime();
            } else if (roundPlayerInfo.joined_at && roundPlayerInfo.left_at) {
              timeTakenMs = new Date(roundPlayerInfo.left_at).getTime() - new Date(roundPlayerInfo.joined_at).getTime();
            }

            return {
              id: round.id,
              word: round.word,
              result: roundPlayerInfo.result,
              timeTaken: timeTakenMs > 0 ? (timeTakenMs / 1000).toFixed(2) + "s" : "N/A",
              usedLives: usedLives,
              roundIndex: round.round_index
            };
          });

          // Sort rounds by index
          rounds.sort((a: any, b: any) => a.roundIndex - b.roundIndex);

          return {
            id: game.id,
            gameMode: game.mode_id === 1 ? "Single Player" : "Multiplayer",
            gameResult: gamePlayerInfo.result,
            totalLives: game.total_lives,
            totalWords: game.number_of_words,
            timestamp: game.created_at,
            rounds: rounds
          };
        });

        res.status(200).json({
          logs: formattedLogs,
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        });
      },
    },
  ],
};

export default logsRouter;
