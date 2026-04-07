import type { Socket } from "socket.io";
import type { ZodObject } from "zod";
export interface SocketRouteObject {
  eventCategory: string;
  functions: SocketRoute[];
}

export interface SocketRoute<TPayload = unknown> {
  event: string;
  auth: authorization;
  rateLimit: rateLimit;
  zodSchema?: ZodObject<any> | undefined;
  handler: (
    socket: Socket,
    payload: TPayload,
    next: (err?: any) => void,
  ) => void | Promise<void>;
}

export type authorization = "required" | "optional" | "none";
export type rateLimit = "strict" | "game_move" | "read";
