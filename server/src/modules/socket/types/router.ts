import type { Socket } from "socket.io";

export interface SocketRouteObject {
  eventCategory: string;
  functions: SocketRoute[];
}

export interface SocketRoute<TPayload = unknown> {
  event: string;
  auth: authorization;
  rateLimit: rateLimit;

  handler: (
    socket: Socket,
    payload: TPayload,
    next: (err?: any) => void,
  ) => void | Promise<void>;
}

export type authorization = "required" | "optional" | "none";
export type rateLimit = "strict" | "gameplay" | "read";
