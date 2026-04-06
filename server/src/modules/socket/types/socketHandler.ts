import type { Socket } from "socket.io";

export type SocketHandler<Tpayload = unknown> = (
  socket: Socket,
  payload: Tpayload,
  next: NextFunction,
) => void | Promise<void>;

export type Tpayload = unknown;
export type NextFunction = (err?: any) => void;
