import { z } from "zod";

const profilePicturesBaseUrl =
  process.env.SUPABASE_URL + "/storage/v1/object/public/profile_pictures/";

export const idValueSchema = z.uuid("Invalid ID format");

export const usernameValueSchema = z
  .string("Username must be a string")
  .trim()
  .min(3, "Username must be at least 3 characters long")
  .max(30, "Username cannot be more than 30 characters long")
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9 _-]*[a-zA-Z0-9]$/,
    "Username can only contain letters, numbers, spaces, underscores and hyphens",
  );

export const pfpValueSchema = z
  .url("Invalid profile picture URL")
  .trim()
  .startsWith(
    profilePicturesBaseUrl,
    "Profile picture must be stored in the game storage",
  )
  .max(2048, "Profile picture URL is too long");

export const statusValueSchema = z
  .string("Status must be a string")
  .trim()
  .max(160, "Status cannot be more than 160 characters long");

export const idSchema = z.object({
  id: idValueSchema,
});

export const usernameSchema = z.object({
  username: usernameValueSchema,
});

export const pfpSchema = z.object({
  pfp: pfpValueSchema,
});

export const querySearchSchema = z.object({
  q: z
    .string("Search query must be a string")
    .trim()
    .min(2, "Search query must be at least 2 characters long")
    .max(100, "Search query cannot be more than 100 characters long"),

  limit: z.coerce
    .number("Limit must be a number")
    .int("Limit must be an integer")
    .min(1, "Limit must be a positive integer")
    .max(100, "Limit cannot be more than 100")
    .default(10),

  page: z.coerce
    .number("Page must be a number")
    .int("Page must be an integer")
    .min(1, "Page must be a positive integer")
    .default(1),
});

export const reasonableWordSchema = z
  .string("Word must be a string")
  .trim()
  .regex(
    /^[A-Za-z]+([ -][A-Za-z]+)*$/,
    "Word can only contain letters, spaces and hyphens",
  )
  .min(2, "Word must be at least 2 letters long.")
  .max(20, "Word must be at most 20 letters long.");
