import type { Server, Socket } from "socket.io";
import fs from "fs/promises";
import path from "path";
import type { SocketRouteObject } from "../types/router.js";
import authenticateSocket from "./authenticator.js";
import { authHandler } from "../lib/auth.js";
import { rateLimiter } from "./rateLimiter.js";
import socketHandler from "./socketHandler.js";
import { tryCatchSocket } from "../utils/tryCatch.js";
import { validate } from "./inputSanitizer.js";
import { z } from "zod";
import { SocketRouteObjectSchema } from "../schemas/socketHandlerSchema.js";

export default async function socketRouter(io: Server) {
  const parentDir = path.join(import.meta.dirname, "../routes");

  io.use(async (socket, next) => {
    try {
      await authenticateSocket(socket);
      next();
    } catch (err) {
      console.error("Socket authentication error:", err);
      next(
        err instanceof Error ? err : new Error("Socket authentication failed"),
      );
    }
  });

  try {
    const directory = await fs.readdir(parentDir, {
      withFileTypes: true,
    });

    const socketRoutes: SocketRouteObject[] = [];

    for (const dir of directory) {
      if (!/\.(ts|js|cjs|mjs)$/i.test(dir.name)) continue;
      const module = await import(path.join(parentDir, dir.name));
      const imported = module.default as SocketRouteObject;

      const parsed = SocketRouteObjectSchema.safeParse(imported);

      if (!parsed.success) {
        console.error(
          `Invalid socket route object in ${dir.name}`,
          parsed.error,
        );
        continue;
      }

      socketRoutes.push(parsed.data as SocketRouteObject);
    }
    io.on("connection", (socket) => {
      for (const routerObj of socketRoutes) {
        for (const obj of routerObj.functions) {
          const fullEvent = `${routerObj.eventCategory}:${obj.event}`;
          socketHandler(
            socket,
            fullEvent,
            authHandler(obj.auth),
            rateLimiter(obj.rateLimit),
            validate(obj.zodSchema),
            tryCatchSocket(obj.handler),
          );
        }
      }
    });
  } catch (err) {
    console.error("[socketHandler] Failed to read routes directory:", err);
    throw err;
  }

  io.on("error", (err) => {
    console.error("Socket server error:", err);
  });
}
