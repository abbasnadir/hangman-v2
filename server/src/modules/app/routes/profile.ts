import type { Request, Response } from "express";
import type { RouterObject } from "../types/router.js";
import { supabase } from "../lib/supabaseClient.js";
import { NotFoundError, BadRequestError } from "../errors/httpErrors.js";
import { z } from "zod";

import { fetchProfileUpdateContext } from "../utils/dbQueries.js";
import {
  pfpValueSchema,
  statusValueSchema,
  usernameValueSchema,
} from "../schemas/common.schemas.js";

interface ProfileUpdates {
  username?: string;
  pfp?: string | null;
  status?: string | null;
  username_updated_at?: string | null;
  pfp_updated_at?: string | null;
}

const DEFAULT_PROFILE_PICTURE =
  process.env.SUPABASE_URL +
  "/storage/v1/object/public/profile_pictures/default.png";

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
          .select(
            "username, pfp, status, created_at, username_updated_at, pfp_updated_at",
          )
          .eq("id", req.user.id)
          .is("deleted_at", null)
          .single();

        if (error || !profile) {
          throw new NotFoundError("User not found");
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
      zodSchema: z.object({
        body: z
          .object({
            username: usernameValueSchema.optional(),
            pfp: z.union([z.literal(""), pfpValueSchema]).optional(),
            status: statusValueSchema.nullable().optional(),
          })
          .strict(),
      }),
      handler: async (req: Request, res: Response) => {
        const body = res.locals.body as {
          username?: string;
          pfp?: string;
          status?: string | null;
        };
        const updates: ProfileUpdates = {};

        const { currentProfile, usernameOwner } =
          await fetchProfileUpdateContext(req.user.id, body.username);

        if (!currentProfile) {
          throw new NotFoundError("User not found");
        }

        if (body.username !== undefined) {
          if (usernameOwner && usernameOwner.id !== req.user.id) {
            throw new BadRequestError("Username already taken");
          }

          if (body.username === currentProfile.username) {
            throw new BadRequestError("Username same as current username.");
          }

          if (currentProfile.username_updated_at) {
            const lastUpdated = new Date(
              currentProfile.username_updated_at,
            ).getTime();
            const now = Date.now();
            const diffInHours = (now - lastUpdated) / (1000 * 60 * 60);

            if (diffInHours < 12) {
              throw new BadRequestError(
                `Username can only be changed once every 12 hours. Please try again in ${Math.ceil(12 - diffInHours)} hour(s).`,
              );
            }
          }

          updates.username = body.username;
          updates.username_updated_at = new Date().toISOString();
        }

        if (body.pfp !== undefined) {
          updates.pfp = body.pfp === "" ? DEFAULT_PROFILE_PICTURE : body.pfp;

          if (body.pfp !== "") {
            if (
              !body.pfp.startsWith(
                process.env.SUPABASE_URL +
                  `/storage/v1/object/public/profile_pictures/${req.user.id}`,
              )
            ) {
              throw new BadRequestError(
                "Profile picture must be stored in the game storage",
              );
            }
          }
          updates.pfp_updated_at = new Date().toISOString();
        }

        if (body.status !== undefined) {
          updates.status = body.status;
        }

        if (Object.keys(updates).length === 0) {
          throw new BadRequestError("No fields to update");
        }

        const { data: profile, error } = await supabase
          .from("profiles")
          .update(updates)
          .eq("id", req.user.id)
          .is("deleted_at", null)
          .select(
            "username, pfp, status, created_at, username_updated_at, pfp_updated_at",
          )
          .single();

        if (error || !profile) {
          throw new NotFoundError("User not found");
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
          throw new NotFoundError("User not found");
        }

        const { error: deleteError } = await supabase
          .from("profiles")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", req.user.id);

        if (deleteError) {
          throw new BadRequestError("Failed to delete user");
        }

        res.sendStatus(204);
      },
    },
  ],
};

export default profileRouter;
