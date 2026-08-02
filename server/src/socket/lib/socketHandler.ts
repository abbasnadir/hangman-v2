import type { Socket } from "socket.io";
import type { NextFunction, SocketMiddleware } from "../types/socketHandler.js";
import { errorHandler } from "./errorHandler.js";

export default function socketHandler(
  socket: Socket,
  eventPath: string,
  ...args: SocketMiddleware[]
) {
  for (const index in args) {
    if (typeof args[index] !== "function") {
      throw new Error(
        `Invalid argument at index ${index} for event ${eventPath}. Expected a function but received ${typeof args[index]}.`,
      );
    }
  }

  socket.on(eventPath, (payload) => {
    let currentIndex = 0;
    let finished = false;

    const next: NextFunction = (err) => {
      if (finished) return;

      if (err) {
        finished = true;

        errorHandler(err, socket, eventPath);

        return;
      }

      const currentHandler = args[currentIndex];
      currentIndex += 1;

      if (!currentHandler) {
        finished = true;
        return;
      }

      Promise.resolve(currentHandler(socket, payload, next)).catch(next);
    };

    next();
  });
}
