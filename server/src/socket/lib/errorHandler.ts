import type { Socket } from "socket.io";
import { AppError } from "../../shared/errors/AppError.js";

export const errorHandler = (
  err: AppError | unknown,
  socket: Socket,
  _eventPath: string,
) => {
  if (!(err instanceof AppError)) {
    console.error("Unhandled Error:", err);

    return socket.emit("socket:error", {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong",
      },
    });
  }

  socket.emit("socket:error", {
    error: {
      code: err.code,
      message: err.message,
    },
  });

  const isDev = process.env.NODE_ENV === "development";

  // Developer logging in development environment
  if (isDev) {
    console.error(
      `Error Code: ${err.code}\n` +
        `Message: ${err.message}\n` +
        `Stack:\n${err.stack}`,
    );
  }
};
