import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";
import { BadRequestError, NotFoundError } from "../errors/httpErrors.js";
import { fetchUser, validateID, validateUsername } from "../utils/validators.js";
import { supabase } from "../lib/supabaseClient.js";

const meRouter: RouterObject = {
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

        const user = await fetchUser(username);

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
          .is("deleted_at", null)
          .single();

        if (error || !profile) {
          throw new NotFoundError(error.message || "User not found");
        }

        res.status(200).json(profile);
      },
    },
  ],
};

export default meRouter;
