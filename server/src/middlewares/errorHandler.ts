import type {
  Request,
  Response,
  NextFunction,
  ErrorRequestHandler,
} from "express";
import { AppError } from "../errors/AppError.js";
import type { ResponseError } from "../../types/response-error.js";

const isDev = process.env.NODE_ENV === "development";

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
    console.error("Unhandled Error:", err);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      },
    });
  }

  // Trusted AppError
  if (isDev) {
    console.error(
      `Error Code: ${err.code}\n` +
        `Message: ${err.message}\n` +
        `Stack:\n${err.stack}`,
    );
  }

  return res.status(err.statusCode ?? 500).json({
    error: {
      code: err.code,
      message: err.message,
    },
  });
};
