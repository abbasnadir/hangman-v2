import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import socketRouter from "./lib/socketRouter.js";

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

  socketRouter(io);
};

export default createSocketServer;
