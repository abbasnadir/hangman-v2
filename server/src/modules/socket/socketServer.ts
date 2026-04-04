import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

export const createSocketServer = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === "production"
          ? process.env.PROD_URL
          : "http://localhost:3000",
      credentials: true,
    },
  });

  io.on("open", () => {
    console.log("Socket server is running");
  });

  io.on("error", (err) => {
    console.error("Socket server error:", err);
  });
};

export default createSocketServer;