import type { Socket } from "socket.io";
import type { rateLimit } from "../types/router.js";
import { RateLimiterMemory } from "rate-limiter-flexible";

import type {
  NextFunction,
  SocketMiddleware,
  Tpayload,
} from "../types/socketHandler.js";
import { AppError } from "../../shared/errors/AppError.js";

const limiters: Record<string, RateLimiterMemory> = {
  strict: new RateLimiterMemory({ points: 5, duration: 60 }),
  game: new RateLimiterMemory({ points: 20, duration: 60 }),
  game_move: new RateLimiterMemory({ points: 150, duration: 60 }),
  read: new RateLimiterMemory({ points: 20, duration: 60 }),
};

export function rateLimiter(rateLimit: rateLimit): SocketMiddleware {
  return async (socket: Socket, _payload: Tpayload, next: NextFunction) => {
    const limiter = limiters[rateLimit];
    if (!limiter) return next();

    // Key by user (falling back to IP) so reconnecting doesn't reset the limits.
    const key = socket.data.user?.id ?? socket.handshake.address;
    try {
      await limiter.consume(`${rateLimit}:${key}`);
      next();
    } catch (err) {
      console.warn(
        `Rate limit exceeded for ${key} (socket ${socket.id}) on event with rate limit "${rateLimit}"`,
      );
      next(
        new AppError(
          `Rate limit exceeded. Please wait before sending more requests.`,
          429,
          "RATE_LIMITED",
        ),
      );
    }
  };
}

