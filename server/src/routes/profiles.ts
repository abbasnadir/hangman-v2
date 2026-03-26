import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";
import { BadRequestError, NotFoundError } from "../errors/httpErrors.js";
import { validateID, validateUsername } from "../utils/validators.js";
import { fetchUserWithUsername } from "../utils/dbQueries.js";
import { supabase } from "../lib/supabaseClient.js";

const profilesRouter: RouterObject = {
  path: "/profiles",
  functions: [
    {
      method: "get",
      props: "/exists/",
      authorization: "none",
      rateLimit: "read",
      keyType: "ip",
      handler: async (req: Request, res: Response) => {
        const username = req.query.username as string;

        if (!username) {
          throw new BadRequestError("Specify a username to see if it exists.");
        }

        validateUsername(username);

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
      handler: async (req: Request, res: Response) => {
        const id = req.params.id as string;

        if (!id) {
          throw new BadRequestError("Specify a user id to fetch the profile.");
        }

        validateID(id);

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
      handler: async (req: Request, res: Response) => {
        const query = req.query.q as string;
        const limit = parseInt((req.query.limit as string) || "10");
        const page = parseInt((req.query.page as string) || "1");

        if (!query) {
          throw new BadRequestError("Specify a search query.");
        }

        if (isNaN(limit) || limit < 1 || limit > 100) {
          throw new BadRequestError(
            "Limit must be a number between 1 and 100.",
          );
        }

        if (isNaN(page) || page < 1) {
          throw new BadRequestError("Page must be a number greater than 0.");
        }

        const { data: profiles, error } = await supabase
          .from("profiles")
          .select("id, username, pfp, status")
          .ilike("username", `%${query}%`)
          .is("deleted_at", null)
          .limit(limit)
          .range((page - 1) * limit, page * limit - 1);

        if (error) {
          throw new NotFoundError(
            "Error searching for profiles",
          );
        }

        res.status(200).json(profiles);
      },
    },
  ],
};

export default profilesRouter;
