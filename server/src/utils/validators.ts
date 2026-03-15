import { BadRequestError } from "../errors/httpErrors.js";
import type { Request, Response } from "express";
import { supabase } from "../lib/supabaseClient.js";

export async function fetchUserWithUsername(
  username: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .is("deleted_at", null)
    .single();

  if (error && error.code !== "PGRST116") {
    //PGRST116 is the error code for "No rows found", which is expected if the username doesn't exist
    throw error;
  }

  return data;
}

export async function fetchUserWithId(
  userId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .is("deleted_at", null)
    .single();

  if (error && error.code !== "PGRST116") {
    //PGRST116 is the error code for "No rows found", which is expected if the username doesn't exist
    throw error;
  }

  return data;
}

export async function validateUsername(username: string) {
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

export function validateID(id: string) {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(id)) {
    throw new BadRequestError("Invalid ID format");
  }
}
