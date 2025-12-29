// Import types
import type { authorization } from "../../types/router.js";
import type { NextFunction, Request, Response, RequestHandler } from "express";

// Module imports
import { UnauthorizedError } from "../errors/httpErrors.js";
import verifyJwt from "./verifyJwt.js";

/* An Auth Handler that takes authType
and returns middleware to dynamically handle
authentication based on the RouteObject's needs.
*/
export function authHandler(authType: authorization): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
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
