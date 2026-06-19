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

const limiters: Record<string, RateLimiterMemory> = {
  strict: new RateLimiterMemory({ points: 5, duration: 60 }),
  game_move: new RateLimiterMemory({ points: 150, duration: 60 }),
  read: new RateLimiterMemory({ points: 20, duration: 60 }),
};

export function rateLimiter(rateLimit: rateLimit): SocketMiddleware {
  return async (socket: Socket, _payload: Tpayload, next: NextFunction) => {
    const limiter = limiters[rateLimit];
    if (!limiter) return next();

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

