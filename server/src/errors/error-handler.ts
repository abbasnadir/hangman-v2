import express from 'express';
import type { ResponseError } from "../../types/response-error.js";

export function errorHandler(
  err: ResponseError,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong",
    },
  });
}
