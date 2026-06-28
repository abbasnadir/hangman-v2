import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import socketRouter from "./lib/socketRouter.js";

let io: Server;

export const createSocketServer = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === "production"
          ? process.env.PROD_URL
          : "http://localhost:3000",
      credentials: true,
    },
  });

  socketRouter(io);
};

export const forceDisconnectUser = (userId: string) => {
  if (!io) return;
  io.to(`user_${userId}`).disconnectSockets(true);
};

export default createSocketServer;
