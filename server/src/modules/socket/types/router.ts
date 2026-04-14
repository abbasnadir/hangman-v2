import type { ZodType } from "zod";
import type { SocketController } from "./socketHandler.js";
export interface SocketRouteObject {
  eventCategory: string;
  functions: SocketRoute[];
}

export interface SocketRoute<TPayload = unknown> {
  event: string;
  auth: authorization;
  rateLimit: rateLimit;
  zodSchema?: ZodType<TPayload> | undefined;
  handler: SocketController<TPayload>;
}

export type authorization = "required" | "optional" | "none";
export type rateLimit = "strict" | "game_move" | "read";
