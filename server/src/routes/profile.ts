import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";
import { supabase } from "../lib/supabaseClient.js";
import { NotFoundError, UnauthorizedError, BadRequestError } from "../errors/httpErrors.js";
import { validatePfp, validateUsername } from "../utils/validators.js";

/* GET home page. */
const profileRouter: RouterObject = {
  path: "/profile",
  functions: [
    {
      method: "get",
      props: "/",
      authorization: "required",
      rateLimit: "read",
      keyType: "user",
      handler: async (req: Request, res: Response) => {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("username, pfp, status, created_at, updated_at")
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
    {
      method: "patch",
      props: "/",
      authorization: "required",
      rateLimit: "strict",
      keyType: "user",
      handler: async (req: Request, res: Response) => {
        const updates = {
          username: req.body.username,
          pfp: req.body.pfp,
          status: req.body.status,
        };

        if (req.body.username) {
          validateUsername(req);
        }

        if(req.body.pfp) {
          validatePfp(req);
        }

        Object.keys(updates).forEach((k) => {
          const key = k as keyof typeof updates;
          if(updates[key] === undefined) delete updates[key];
        });

        if (Object.keys(updates).length === 0) {
          throw new UnauthorizedError("No fields to update");
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .update(updates)
          .eq("id", req.user.id)
          .is("deleted_at", null)
          .select("username, pfp, status, created_at")
          .single();

        if (error || !profile) {
          throw new NotFoundError(error?.message || "User not found");
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
