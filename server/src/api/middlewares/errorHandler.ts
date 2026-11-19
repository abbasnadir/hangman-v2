import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import { AppError } from "../../shared/errors/AppError.js";
import type { ResponseError } from "../types/responseError.js";

const isDev = process.env.NODE_ENV === "development";

// Error Handler middleware
export const errorHandler: ErrorRequestHandler = (
  err: ResponseError,
  _req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (res.headersSent) {
    return next(err);
  }

  // Unknown / untrusted error
  if (!(err instanceof AppError)) {
    // Errors raised by middleware before the route runs (malformed JSON, payload too
    // large, ...) carry their own 4xx status and are the client's fault, not a 500.
    const status = (err as any)?.status ?? (err as any)?.statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return res.status(status).json({
        error: {
          code: "BAD_REQUEST",
          message: (err as any)?.expose ? (err as Error).message : "Bad request",
        },
      });
    }

    console.error("Unhandled Error:", err);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      },
    });
  }

  // Developer logging in development environment
  if (isDev) {
    console.error(
      `Error Code: ${err.code}\n` +
        `Message: ${err.message}\n` +
        `Stack:\n${err.stack}`,
    );
  }

  // Trusted AppError
  return res.status(err.statusCode ?? 500).json({
    error: {
      code: err.code,
      message: err.message,
    },
  });
};
