import type { SocketRouteObject } from "../types/router.js";

export const meRoute: SocketRouteObject = {
  eventCategory: "test",
  functions: [
    {
      event: "index",
      auth: "none",
      rateLimit: "strict",
      handler: (socket, _payload) => {
        socket.emit("Test", { ok: true, socketId: socket.id });
      },
    },
  ],
};

export default meRoute;
