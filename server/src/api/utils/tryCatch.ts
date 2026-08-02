import type { RequestHandler } from "express";

// TryCatch block wrapper for clean code
export const tryCatch = (controller: RequestHandler): RequestHandler => async (req, res, next) => {
    try {
        await controller(req, res, next);
    } catch (error) {
        next(error);
    }
}