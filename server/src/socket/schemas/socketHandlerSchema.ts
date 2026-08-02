import { z } from "zod";

const authorizationSchema = z.enum(["required", "optional", "none", "non-guest"]);
const rateLimitSchema = z.enum(["strict", "game", "game_move", "read"]);

const SocketRouteSchema = z.object({
  event: z.string(),
  auth: authorizationSchema,
  rateLimit: rateLimitSchema,
  zodSchema: z.unknown().optional(),
  handler: z.function(),
});

export const SocketRouteObjectSchema = z.object({
  eventCategory: z.string(),
  functions: z.array(SocketRouteSchema),
});
