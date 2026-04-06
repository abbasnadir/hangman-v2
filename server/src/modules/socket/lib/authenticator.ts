import type { Socket } from "socket.io";
import verifyJwt from "../../shared/lib/verifyJwt.js";

export default async function authenticateSocket(socket: Socket) {
  const handshakeToken = socket.handshake.auth?.token;

  if (handshakeToken == null || handshakeToken === "") {
    return;
  }

  if (typeof handshakeToken !== "string") {
    throw new Error("Invalid authentication token");
  }

  const token = handshakeToken.startsWith("Bearer ")
    ? handshakeToken.slice(7)
    : handshakeToken;

  if (!token) {
    throw new Error("Authentication required");
  }

  try {
    socket.data.user = await verifyJwt(token);
  } catch {
    throw new Error("Invalid or expired token");
  }
}
