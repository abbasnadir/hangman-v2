import type { SocketRouteObject } from "../types/router.js";

export const meRoute: SocketRouteObject = {
  eventCategory: "test",
  functions: [
    {
      event: "me",
      auth: "none",
      rateLimit: "strict",
      handler: (socket, _payload) => {
        socket.emit("you", { ok: true, socketId: socket.id });
        console.log("Received 'me' event from socket:", socket.id);
      },
    },
  ],
};

export default meRoute;
