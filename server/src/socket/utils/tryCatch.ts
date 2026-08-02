import type {
  SocketController,
  SocketMiddleware,
} from "../types/socketHandler.js";

// TryCatch block wrapper for clean code
export const tryCatchSocket =
  (controller: SocketController): SocketMiddleware =>
  async (socket, payload, next) => {
    try {
      await controller(socket, payload);
      next();
    } catch (error) {
      next(
        error || new Error("An unknown error occurred in the socket handler."),
      );
    }
  };
