import type { rateLimit } from "../types/router.js";
import type { SocketHandler } from "../types/socketHandler.js";

export function rateLimiter(rateLimit: rateLimit): SocketHandler {
  return async (socket, payload) => {};
}
