import type { authorization } from "../types/router.js";
import type {
  SocketHandler,
  Tpayload,
  NextFunction,
} from "../types/socketHandler.js";
import type { Socket } from "socket.io";

// An Auth Handler that takes authType
// and returns middleware to dynamically handle
// authentication based on the RouteObject's needs.

export function authHandler(authType: authorization): SocketHandler {
  return async (socket: Socket, payload: Tpayload, next: NextFunction) => {};
}
