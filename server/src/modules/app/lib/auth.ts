// Import types
import type { authorization } from "../types/router.js";
import type { NextFunction, Request, Response, RequestHandler } from "express";

// Module imports
import {
  UnauthorizedError,
  NotFoundError,
} from "../../shared/errors/httpErrors.js";
import verifyJwt from "../../shared/lib/verifyJwt.js";
import { fetchUserWithId } from "../utils/dbQueries.js";

/* An Auth Handler that takes authType
and returns middleware to dynamically handle
authentication based on the RouteObject's needs.
*/
export function authHandler(authType: authorization): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    try {
      // Required Auth, stop the route strictly if unauthenticated by throwing errors
      if (authType === "required") {
        if (!authHeader?.startsWith("Bearer ")) {
          throw new UnauthorizedError("Authentication required");
        }
        try {
          req.user = await verifyJwt(authHeader.slice(7));
        } catch (err) {
          throw new UnauthorizedError("Invalid or expired token");
        }

        // Check if user exists and is not deleted in the database for required auth routes
        fetchUserWithId(req.user.id)
          .then((user) => {
            if (!user) {
              throw new NotFoundError("User not found or deleted");
            }
          })
          .catch((err) => {
            throw err instanceof Error ? err : new Error("Database error");
          });

        // Optional Auth, Try auth but ignore if not present
      } else if (authType === "optional") {
        if (authHeader?.startsWith("Bearer ")) {
          try {
            req.user = await verifyJwt(authHeader.slice(7));
          } catch {
            // ignore invalid token for optional auth
          }
        }
      }
      // No auth (authType === "none") - just continue

      next();
    } catch (err) {
      next(err);
    }
  };
}
