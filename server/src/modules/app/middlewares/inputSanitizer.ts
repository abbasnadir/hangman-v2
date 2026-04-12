import type { ZodObject } from "zod";
import type { NextFunction, Request, Response } from "express";
import { BadRequestError } from "../../shared/errors/httpErrors.js";

export const validate =
  (zodSchema?: ZodObject) =>
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

    if (result.data.body) res.locals.body = result.data.body;
    if (result.data.params) res.locals.params = result.data.params;
    if (result.data.query) res.locals.query = result.data.query;

    next();
  };
