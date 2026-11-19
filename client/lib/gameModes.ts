/** Must match the ids in the `game_modes` table and server/src/socket/game/core/factory.ts. */
export const GAME_MODES = {
  CLASSIC: 1,
  MULTIPLAYER: 2,
  COUNTDOWN: 3,
} as const;

/** Single player modes start as soon as the player joins (no lobby). */
export const isSinglePlayerMode = (modeId: number) =>
  modeId === GAME_MODES.CLASSIC || modeId === GAME_MODES.COUNTDOWN;
