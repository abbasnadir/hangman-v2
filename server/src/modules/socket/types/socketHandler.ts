import type { Socket } from "socket.io";

export type SocketMiddleware<Tpayload = unknown> = (
  socket: Socket,
  payload: Tpayload,
  next: NextFunction,
) => void | Promise<void>;

export type SocketController<TPayload = unknown> = (
  socket: Socket,
  payload: TPayload,
) => void | Promise<void>;

export type Tpayload = unknown;
export type NextFunction = (err?: any) => void;
