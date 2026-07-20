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
import { UnauthorizedError } from "../../shared/errors/httpErrors.js";
export function authHandler(authType: authorization): SocketMiddleware {
  return async (socket: Socket, _payload: Tpayload, next: NextFunction) => {
    if (authType === "none") {
      return next();
    }

    const handshakeToken = socket.handshake.auth?.token;

    if (authType === "required" || authType === "non-guest") {
      if (handshakeToken == null || handshakeToken === "") {
        return next(new UnauthorizedError("Authentication required"));
      }
    }

    if (authType === "optional") {
      if (handshakeToken == null || handshakeToken === "") {
        return next();
      }
    }

    try {
      await authenticateSocket(socket);
      
      if (authType === "non-guest" && socket.data.user?.is_anonymous) {
        return next(new UnauthorizedError("Guest accounts are not permitted to perform this action."));
      }

      return next();
    } catch (err) {
      return next(
        err instanceof Error
          ? err
          : new UnauthorizedError("Invalid authentication token"),
      );
    }
  };
}
