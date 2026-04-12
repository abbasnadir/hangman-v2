import type { authorization } from "../types/router.js";
import type {
  SocketMiddleware,
  Tpayload,
  NextFunction,
} from "../types/socketHandler.js";
import type { Socket } from "socket.io";

// An Auth Handler that takes authType
// and returns middleware to dynamically handle
// authentication based on the RouteObject's needs.
import authenticateSocket from "./authenticator.js";
export function authHandler(authType: authorization): SocketMiddleware {
  return async (socket: Socket, _payload: Tpayload, next: NextFunction) => {
    if (authType === "none") {
      return next();
    }

    const handshakeToken = socket.handshake.auth?.token;

    if (authType === "required") {
      if (handshakeToken == null || handshakeToken === "") {
        return next(new Error("Authentication required"));
      }
    }

    if (authType === "optional") {
      if (handshakeToken == null || handshakeToken === "") {
        return next();
      }
    }

    try {
      await authenticateSocket(socket);
      return next();
    } catch (err) {
      return next(err instanceof Error ? err : new Error(String(err)));
    }
  };
}
