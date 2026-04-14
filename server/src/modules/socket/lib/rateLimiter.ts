import type { Socket } from "socket.io";
import type { rateLimit } from "../types/router.js";
import { RateLimiterMemory } from "rate-limiter-flexible";

import type {
  NextFunction,
  SocketMiddleware,
  Tpayload,
} from "../types/socketHandler.js";
import {
  UnauthorizedError,
} from "../../shared/errors/httpErrors.js";

export function rateLimiter(rateLimit: rateLimit): SocketMiddleware {
  return async (socket: Socket, _payload: Tpayload, next: NextFunction) => {
    let points: number;
    let duration: number;

    switch (rateLimit) {
      case "strict":
        points = 5;
        duration = 60;
        break;
      case "game_move":
        points = 150;
        duration = 60;
        break;
      case "read":
        points = 20;
        duration = 60;
        break;
      default:
        return next();
    }

    const limiter = new RateLimiterMemory({
      points,
      duration,
    });

    try {
      await limiter.consume(socket.id);
      next();
    } catch (err) {
      console.warn(
        `Rate limit exceeded for socket ${socket.id} on event with rate limit "${rateLimit}"`,
      );
      next(
        new UnauthorizedError(
          `Rate limit exceeded. Please wait before sending more requests.`,
        ),
      );
    }
  };
}
