import type { Socket } from "socket.io";
import type { NextFunction, Tpayload } from "../types/socketHandler.js";
import type { ZodObject } from "zod";

export const validate = (schema?: ZodObject<any>) => {
  return async (socket: Socket, payload: Tpayload, next: NextFunction) => {
    if (!schema) return next();

    const result = await schema.safeParseAsync(payload);

    if (result.success) {
      return next();
    }

    return next(
      new Error(
        result.error.issues.map((issue) => issue.message).join(", ") ||
          "Invalid input",
      ),
    );
  };
};
