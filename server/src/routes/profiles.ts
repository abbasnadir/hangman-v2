import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";
import { NotFoundError } from "../errors/httpErrors.js";
import { fetchUserWithUsername } from "../utils/dbQueries.js";
import { supabase } from "../lib/supabaseClient.js";
import { z } from "zod";
import {
  querySearchSchema,
  usernameSchema,
  idSchema,
} from "../schemas/common.schemas.js";

const profilesRouter: RouterObject = {
  path: "/profiles",
  functions: [
    {
      method: "get",
      props: "/exists/",
      authorization: "none",
      rateLimit: "read",
      keyType: "ip",
      zodSchema: z.object({ query: usernameSchema }),
      handler: async (req: Request, res: Response) => {
        const username: string = res.locals.query.username;

        const user = await fetchUserWithUsername(username);

        res.status(200).json({ exists: !!user });
      },
    },
    {
      method: "get",
      props: "/view/:id/",
      authorization: "none",
      rateLimit: "read",
      keyType: "default",
      zodSchema: z.object({ params: idSchema }),
      handler: async (req: Request, res: Response) => {
        const id = res.locals.params.id;

        const { data: profile, error } = await supabase
          .from("profiles_with_stats")
          .select(
            "id, username, pfp, status, created_at, games_played, games_won, games_lost",
          )
          .eq("id", id)
          .single();

        if (error || !profile) {
          throw new NotFoundError("User not found");
        }

        res.status(200).json(profile);
      },
    },
    {
      method: "get",
      props: "/search/",
      authorization: "required",
      rateLimit: "read",
      keyType: "user",
      zodSchema: z.object({ query: querySearchSchema }),
      handler: async (req: Request, res: Response) => {
        const query: string = res.locals.query.q;
        const limit: number = res.locals.query.limit;
        const page: number = res.locals.query.page;

        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("id, username, pfp, status")
          .ilike("username", `%${query}%`)
          .is("deleted_at", null)
          .limit(limit)
          .range((page - 1) * limit, page * limit - 1);

        if (error) {
          throw new NotFoundError("Error searching for profiles");
        }

        res.status(200).json(profiles);
      },
    },
  ],
};

export default profilesRouter;
