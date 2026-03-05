import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";
import { BadRequestError, NotFoundError } from "../errors/httpErrors.js";
import { fetchUser, validateUsername } from "../utils/validators.js";
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
        const username = req.params.username;

        if (!username) {
          throw new BadRequestError("Specify a username to see if it exists.");
        }

        validateUsername(username);

        const user = await fetchUser(username);

        res.status(200).json({ exists: !!user });
      },
    },
    // {
    //   method: "get",
    //   props: "/view/:username/",
    //   authorization: "none",
    //   rateLimit: "read",
    //   keyType: "ip",
    //   handler: async (req: Request, res: Response) => {
    //     const username = req.params.username;

    //     if (!username) {
    //       throw new BadRequestError("Specify a username to fetch the profile.");
    //     }

    //     validateUsername(username);

    //     const { data: profile, error } = await supabase
    //       .from("profiles")
    //       .select("username, pfp, status, created_at, updated_at")
    //       .eq("username", username)
    //       .is("deleted_at", null)
    //       .single();

    //     if (error || !profile) {
    //       throw new NotFoundError(error.message || "User not found");
    //     }

    //     res.status(200).json(profile);
    //   },
    // }
  ],
};

export default meRouter;
