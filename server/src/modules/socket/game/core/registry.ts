import type { GameMode } from "../core/GameMode.js";

// Global in-memory game registry
export const activeGameInstances: Record<string, GameMode> = {};
