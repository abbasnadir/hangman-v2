import { supabase } from "../../app/lib/supabaseClient.js";

export async function fetchUserActiveGameRound(userId: string) {
  const { data: gameData, error: gameError } = await supabase
    .from("game_round_players")
    .select(
      `
                game_round_id,
                game_rounds!inner(status)
            `,
    )
    .eq("user_id", userId)
    .is("left_at", null)
    .in("game_rounds.status", ["in_progress"])
    .limit(1);

  if (gameError) {
    throw new Error(gameError.message);
  }

  return gameData;
}

export async function fetchActiveRound(gameId: string) {
  const { data: roundData, error: roundError } = await supabase
    .from("game_rounds")
    .select("*")
    .eq("game_id", gameId)
    .in("status", ["in_progress"])
    .limit(1);

  if (roundError) {
    throw new Error(roundError.message);
  }

  return roundData;
}

export async function checkUserInGame(gameId: string, userId: string) {
  const { data, error } = await supabase
    .from("game_players")
    .select("game_id")
    .eq("game_id", gameId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function getRoundPlayer(roundId: string, userId: string) {
  const { data, error } = await supabase
    .from("game_round_players")
    .select("id")
    .eq("game_round_id", roundId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function markPlayerAsActive(roundPlayerId: string) {
  const { error } = await supabase
    .from("game_round_players")
    .update({ left_at: null })
    .eq("id", roundPlayerId);

  if (error) throw new Error(error.message);
}

export async function markPlayerAsDisconnected(roundPlayerId: string) {
  const { error } = await supabase
    .from("game_round_players")
    .update({ left_at: new Date().toISOString() })
    .eq("id", roundPlayerId);

  if (error) throw new Error(error.message);
}

export async function getActivePlayersCount(roundId: string): Promise<number> {
  const { count, error } = await supabase
    .from("game_round_players")
    .select("id", { count: "exact", head: true })
    .eq("game_round_id", roundId)
    .is("left_at", null);

  if (error) throw new Error(error.message);
  return count || 0;
}

export async function abandonGameAndRound(gameId: string, roundId: string) {
  const { error: roundError } = await supabase
    .from("game_rounds")
    .update({ status: "abandoned" })
    .eq("id", roundId);

  if (roundError) throw new Error(roundError.message);

  const { error: gameError } = await supabase
    .from("games")
    .update({ status: "abandoned" })
    .eq("id", gameId);

  if (gameError) throw new Error(gameError.message);
}

export default fetchUserActiveGameRound;
