import type { Server, Socket } from "socket.io";

type SocketRoute = {
  event: string;
  handler: (socket: Socket, payload: unknown) => void | Promise<void>;
};

const gameRoutes: SocketRoute[] = [
  {
    event: "game:join",
    handler: async (socket, payload) => {
      console.log("join", socket.id, payload);
    },
  },
  {
    event: "game:move",
    handler: async (socket, payload) => {
      console.log("move", socket.id, payload);
    },
  },
];

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    for (const route of gameRoutes) {
      socket.on(route.event, (payload) => route.handler(socket, payload));
    }
  });
}
