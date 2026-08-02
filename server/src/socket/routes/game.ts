import type { SocketRouteObject } from "../types/router.js";
import { joinGamePayloadSchema, submitMovePayloadSchema } from "../schemas/gameProcessSchema.js";

// ─── Route ───────────────────────────────────────────────────────────────────
export const gameRoute: SocketRouteObject = {
  eventCategory: "game",
  functions: [
    {
      event: "join",
      auth: "required",
      rateLimit: "game",
      zodSchema: joinGamePayloadSchema,
      handler: async (socket: any, payload: any) => {
        const { joinHandler } = await import("./gameActions/join.js");
        return joinHandler(socket, payload);
      },
    },
    {
      event: "start",
      auth: "required",
      rateLimit: "game",
      handler: async (socket: any) => {
        const { startHandler } = await import("./gameActions/start.js");
        return startHandler(socket);
      },
    },
    {
      event: "submit_move",
      auth: "required",
      rateLimit: "game_move",
      zodSchema: submitMovePayloadSchema,
      handler: async (socket: any, payload: any) => {
        const { submitMoveHandler } = await import("./gameActions/submitMove.js");
        return submitMoveHandler(socket, payload);
      },
    },
    {
      event: "start_next_round",
      auth: "required",
      rateLimit: "game",
      handler: async (socket: any) => {
        const { nextRoundHandler } = await import("./gameActions/nextRound.js");
        return nextRoundHandler(socket);
      },
    },
    {
      event: "leave",
      auth: "required",
      rateLimit: "game",
      handler: async (socket: any) => {
        const { leaveHandler } = await import("./gameActions/leave.js");
        return leaveHandler(socket);
      }
    }
  ],
};
