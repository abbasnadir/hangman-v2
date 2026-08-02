import { z } from "zod";

export const joinGamePayloadSchema = z.object({
  gameId: z.uuid("Invalid game ID. Must be a valid UUID string."),
});

export const submitMovePayloadSchema = z.object({
  guess: z.string().length(1, "Guess must be a single letter.").regex(/^[a-zA-Z]$/, "Guess must be a letter."),
  timestamp: z.string().or(z.date()).transform((val) => new Date(val))
});