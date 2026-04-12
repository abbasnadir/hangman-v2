import type { Socket } from "socket.io";
import type { ZodObject } from "zod";
import type { SocketController } from "./socketHandler.js";
export interface SocketRouteObject {
  eventCategory: string;
  functions: SocketRoute[];
}

export interface SocketRoute<TPayload = unknown> {
  event: string;
  auth: authorization;
  rateLimit: rateLimit;
  zodSchema?: ZodObject<any> | undefined;
  handler: SocketController<TPayload>;
}

export type authorization = "required" | "optional" | "none";
export type rateLimit = "strict" | "game_move" | "read";
