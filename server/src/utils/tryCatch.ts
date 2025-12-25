import type { RequestHandler } from "express";

exports.tryCatch = (controller: RequestHandler): RequestHandler => async (req, res, next) => {
    try {
        await controller(req, res, next);
    } catch (error) {
        next(error);
    }
}