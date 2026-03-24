import { BadRequestError } from "../errors/httpErrors.js";
import type { Request } from "express";
import { supabase } from "../lib/supabaseClient.js";

type ProfileUpdateLookup = {
  id: string;
  username: string;
  username_updated_at: string | null;
  pfp_updated_at: string | null;
};

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

export async function fetchProfileUpdateContext(
  userId: string,
  username?: string,
): Promise<{
  currentProfile: ProfileUpdateLookup | null;
  usernameOwner: ProfileUpdateLookup | null;
}> {
  const columns = "id, username, username_updated_at, pfp_updated_at";

  if (!username) {
    const { data, error } = await supabase
      .from("profiles")
      .select(columns)
      .eq("id", userId)
      .is("deleted_at", null)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return {
      currentProfile: data,
      usernameOwner: null,
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(columns)
    .or(`id.eq.${userId},username.eq.${JSON.stringify(username)}`)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return {
    currentProfile: data.find((profile) => profile.id === userId) ?? null,
    usernameOwner: data.find((profile) => profile.username === username) ?? null,
  };
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
