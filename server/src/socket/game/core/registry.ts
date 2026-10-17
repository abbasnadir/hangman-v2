import type { CoreGameMode } from "../core/CoreGameMode.js";

// Global dictionary mapping gameId -> active CoreGameMode instance
export const activeGameInstances: Record<string, CoreGameMode> = {};
