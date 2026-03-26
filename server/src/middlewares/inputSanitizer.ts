import type { AnyZodObject } from "zod/v3";
import type { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../errors/httpErrors.js";

export const validate =
  (zodSchema?: AnyZodObject) =>
  async (req: Request, res: Response, next: NextFunction) => {
    if (!zodSchema) return next();

    const result = await zodSchema.safeParseAsync({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (result.error) {
      return next(
        new BadRequestError(
          result.error?.issues.map((issue) => issue.message).join(", ") ||
            "Invalid input",
        ),
      );
    }

    req.body = result.data.body;
    req.params = result.data.params;
    req.query = result.data.query;

    next();
  };
