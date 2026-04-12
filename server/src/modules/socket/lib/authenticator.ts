import type { Socket } from "socket.io";
import verifyJwt from "../../shared/lib/verifyJwt.js";
import { UnauthorizedError } from "../../shared/errors/httpErrors.js";

export default async function authenticateSocket(socket: Socket) {
  const handshakeToken = socket.handshake.auth?.token;

  if (handshakeToken == null || handshakeToken === "") {
    return;
  }

  if (typeof handshakeToken !== "string") {
    throw new UnauthorizedError("Invalid authentication token");
  }

  const token = handshakeToken.startsWith("Bearer ")
    ? handshakeToken.slice(7)
    : handshakeToken;

  if (!token) {
    throw new UnauthorizedError("Authentication required");
  }

  try {
    socket.data.user = await verifyJwt(token);
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }
}
