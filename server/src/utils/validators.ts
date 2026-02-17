import { BadRequestError } from "../errors/httpErrors.js";
import type { Request, Response } from "express";
import type { RouterObject } from "../../types/router.js";
import { supabase } from "../lib/supabaseClient.js";

export async function validateUsername(req: Request) {
  const username = req.body.username;
  const usernamePattern = /^[a-zA-Z0-9][a-zA-Z0-9 _-]*[a-zA-Z0-9]$/;

  if (!usernamePattern.test(username)) {
    throw new BadRequestError("Invalid username format");
  }

  if (username.length < 3) {
    throw new BadRequestError("Username must at least be 3 characters long.");
  }

  if (username.length > 30) {
    throw new BadRequestError(
      "Username must not be more than 30 characters long.",
    );
  }

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .is("deleted_at", null)
    .single();

  if (existing && existing.id !== req.user.id) {
    throw new BadRequestError("Username already taken");
  }

  if (existing && existing.id === req.user.id) {
    throw new BadRequestError("Username same as current username.");
  }
}

export async function validatePfp(req: Request) {
  if (
    !req.body.pfp.startsWith(
      process.env.SUPABASE_URL +
        `/storage/v1/object/public/profile_pictures/${req.user.id}`,
    )
  ) {
    throw new BadRequestError("Invalid pfp url");
  }

  if (req.body.pfp.length > 2048) {
    throw new BadRequestError("profile URI too long");
  }
}