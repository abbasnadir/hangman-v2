import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";
import { supabase } from "../lib/supabaseClient.js";
import { NotFoundError, UnauthorizedError } from "../errors/httpErrors.js";

/* GET home page. */
const profileRouter: RouterObject = {
  path: "/profile",
  functions: [
    {
      method: "get",
      props: "/",
      authorization: "required",
      rateLimit: "strict",
      keyType: "default",
      handler: async (req: Request, res: Response) => {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("username, pfp, status, created_at")
          .eq("id", req.user.id)
          .is("deleted_at", null)
          .single();

        if (error || !profile) {
          throw new NotFoundError(error.message || "User not found");
        }

        const user = {
          id: req.user.id,
          email: req.user.email,
          ...profile,
        };

        res.status(200).json(user);
      },
    },
  ],
};

export default profileRouter;
