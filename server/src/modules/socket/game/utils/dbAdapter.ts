import { supabase } from "../../../app/lib/supabaseClient.js";
import {
  abandonGameAndRound,
  getActivePlayersCount,
  markPlayerAsDisconnectedByRound,
  insertMove,
  getWordlistWords,
  getUsedWordsInGame,
  insertNewRound,
  getGamePlayers,
  insertRoundPlayers,
  finishGameRound,
  finishGame,
  updateGamePlayerResult,
  updateRoundPlayerResult,
} from "../../../shared/utils/dbQueries.js";
import type { DbFunctions } from "../core/types.js";

export const dbAdapter: DbFunctions = {
  insertMove,
  getWordlistWords,
  getUsedWordsInGame,
  insertNewRound,
  getGamePlayers,
  insertRoundPlayers,
  finishGameRound,
  finishGame,
  updateGamePlayerResult,
  updateRoundPlayerResult,
  abandonGameAndRound,
  markPlayerAsDisconnectedByRound,
  getActivePlayersCount,
  async getProfile(userId) {
    const { data } = await supabase
      .from("profiles")
      .select("username, pfp")
      .eq("id", userId)
      .single();
    return data ?? null;
  },
  async updateGameStatus(gameId, status, startedAt) {
    await supabase.from("games").update({ status, started_at: startedAt }).eq("id", gameId);
  },
  async updateRoundStatus(roundId, status, startedAt) {
    await supabase.from("game_rounds").update({ status, started_at: startedAt }).eq("id", roundId);
  },
};
