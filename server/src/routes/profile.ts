import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";
import { supabase } from "../lib/supabaseClient.js";
import {
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
} from "../errors/httpErrors.js";
import {
  fetchUserWithUsername,
  fetchUserWithId,
  validatePfp,
  validateUsername,
} from "../utils/validators.js";

const profileRouter: RouterObject = {
  path: "/profile",
  functions: [
    {
      /* Fetch the profile of current user */
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
      /* Update the info of current user */
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
          validateUsername(req.body.username);
          const existing = await fetchUserWithUsername(req.body.username);
          if (existing && existing.id !== req.user.id) {
            throw new BadRequestError("Username already taken");
          }

          if (existing && existing.id === req.user.id) {
            throw new BadRequestError("Username same as current username.");
          }
        }

        if (req.body.pfp) {
          validatePfp(req);
        }

        Object.keys(updates).forEach((k) => {
          const key = k as keyof typeof updates;
          if (updates[key] === undefined) delete updates[key];
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
    {
      /* Delete the current user */
      method: "delete",
      props: "/",
      authorization: "required",
      rateLimit: "strict",
      keyType: "user",
      handler: async (req: Request, res: Response) => {
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("id", req.user.id)
          .is("deleted_at", null)
          .single();

        if (error || !profile) {
          throw new NotFoundError(error?.message || "User not found");
        }

        const { error: deleteError } = await supabase
          .from("profiles")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", req.user.id);

        if (deleteError) {
          throw new BadRequestError(
            deleteError.message || "Failed to delete user",
          );
        }

        res.status(204).json({ message: "User account deleted successfully" });
      },
    },
  ],
};

export default profileRouter;
