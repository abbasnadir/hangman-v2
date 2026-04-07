import { z } from "zod";

const authorizationSchema = z.enum(["required", "optional", "none"]);
const rateLimitSchema = z.enum(["strict", "game_move", "read"]);

const SocketRouteSchema = z.object({
  event: z.string(),
  auth: authorizationSchema,
  rateLimit: rateLimitSchema,
  zodSchema: z.any().optional(),
  handler: z.function(),
});

export const SocketRouteObjectSchema = z.object({
  eventCategory: z.string(),
  functions: z.array(SocketRouteSchema),
});
