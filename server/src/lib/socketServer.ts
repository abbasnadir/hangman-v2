import { Server } from "socket.io";

export const createSocketServer = (httpServer: any) => {
  const io = new Server(httpServer, {
    cors: {
      origin:
        process.env.NODE_ENV === "production"
          ? process.env.PROD_URL
          : "http://localhost:3000",
      credentials: true,
    },
  });
};

export default createSocketServer;
