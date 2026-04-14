import type { Socket } from "socket.io";
import type { NextFunction, Tpayload } from "../types/socketHandler.js";
import type { ZodType } from "zod";
import { BadRequestError } from "../../shared/errors/httpErrors.js";

export const validate = (schema?: ZodType<Tpayload>) => {
  return async (_socket: Socket, payload: Tpayload, next: NextFunction) => {
    if (!schema) return next();

    const result = await schema.safeParseAsync(payload);

    if (result.success) {
      return next();
    }

    return next(
      new BadRequestError(
        result.error.issues.map((issue) => issue.message).join(", ") ||
          "Invalid input",
      ),
    );
  };
};
