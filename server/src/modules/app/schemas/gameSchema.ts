import { z } from "zod";

export const lives = z.coerce
  .number("Total lives must be a number.")
  .int("Invalid option for total lives.")
  .max(30, "Cannot have more than 30 lives.")
  .min(0, "You must have at least 0 life")
  .optional()
  .default(5);

export const numberOfWords = z.coerce
  .number("Number of words must be a number.")
  .int("Invalid option for number of words")
  .max(100, "To save my time, I only allow 100 words max")
  .min(1, "You do need some words to play")
  .optional()
  .default(5);

export const gameSchema = z.object({
  wordlistId: z.uuid("Invalid wordlist ID"),
  gamemode: z.coerce
    .number("gamemode ID must be a number")
    .int("Invalid gamemode ID"),
  totalLives: lives,
  number_of_words: numberOfWords,
});
