import type { SocketRouteObject } from "../../types/router.js";
import { joinGamePayloadSchema, submitMovePayloadSchema } from "../../schemas/gameProcessSchema.js";

// ─── Route ───────────────────────────────────────────────────────────────────
export const gameRoute: SocketRouteObject = {
  eventCategory: "game",
  functions: [
    {
      event: "join",
      auth: "required",
      rateLimit: "strict",
      zodSchema: joinGamePayloadSchema,
      handler: async (socket, payload) => {
        const { joinHandler } = await import("./join.js");
        return joinHandler(socket, payload);
      },
    },
    {
      event: "start",
      auth: "required",
      rateLimit: "strict",
      handler: async (socket) => {
        const { startHandler } = await import("./start.js");
        return startHandler(socket);
      },
    },
    {
      event: "submit_move",
      auth: "required",
      rateLimit: "game_move",
      zodSchema: submitMovePayloadSchema,
      handler: async (socket, payload) => {
        const { submitMoveHandler } = await import("./submitMove.js");
        return submitMoveHandler(socket, payload);
      },
    },
    {
      event: "start_next_round",
      auth: "required",
      rateLimit: "strict",
      handler: async (socket) => {
        const { nextRoundHandler } = await import("./nextRound.js");
        return nextRoundHandler(socket);
      },
    },
    {
      event: "leave",
      auth: "required",
      rateLimit: "strict",
      handler: async (socket) => {
        const { leaveHandler } = await import("./leave.js");
        return leaveHandler(socket);
      }
    }
  ],
};
