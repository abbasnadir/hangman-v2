import type { SocketRouteObject } from "../types/router.js";

export const meRoute: SocketRouteObject = {
  eventCategory: "test",
  functions: [
    {
      event: "me",
      auth: "none",
      rateLimit: "strict",
      handler: (socket, _payload) => {
        socket.emit("you", socket.data.user);
      },
    },
  ],
};

export default meRoute;
