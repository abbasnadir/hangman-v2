import verifyJwt from "../lib/auth.js";
import { UnauthorizedError } from "../errors/httpErrors.js";
import type { Request, Response, NextFunction } from "express";

export async function authHandler(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const request = req.headers.authorization;

  if (!request?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Authentication required");
  }

  try {
    req.user = await verifyJwt(request.slice(7));
  } catch (err) {
    throw new UnauthorizedError("Invalid or expired token");
  }

  return next();
}
