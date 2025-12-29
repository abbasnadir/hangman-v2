import fs from "fs/promises";
import path from "path";
import { Router } from "express";

import { tryCatch } from "../utils/tryCatch.js";
import type { RouterObject } from "../../types/router.js";
import { authHandler } from "./auth.js";
import { rateLimiter } from "./rateLimiter.js";

export async function routesHandler(): Promise<Router> {
  const parentDir = path.join(import.meta.dirname, "../routes");
  const router = Router();

  try {
    const directory = await fs.readdir(parentDir, {
      withFileTypes: true,
    });

    for (const dir of directory) {
      if (dir.isDirectory()) continue;

      // Add more filename options if necessary
      if (!/\.(ts|js|cjs|mjs)$/i.test(dir.name)) continue;

      const module = await import(path.join(parentDir, dir.name));
      const routerObj: RouterObject = module.default;

      for (const obj of routerObj.functions) {
        const fullPath = routerObj.path + (obj.props ?? "");

        router[obj.method](
          fullPath,
          authHandler(obj.authorization),
          rateLimiter.limit(obj.rateLimit, obj.keyType),
          tryCatch(obj.handler)
        );
      }
    }

    return router;
  } catch (err) {
    console.error("[routesHandler] Failed to read routes directory:", err);
    throw err;
  }
}
