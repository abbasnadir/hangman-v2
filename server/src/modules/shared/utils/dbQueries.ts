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
    .eq("game_rounds.status", "in_progress")
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
    .eq("status", "in_progress")
    .limit(1);

  if (roundError) {
    throw new Error(roundError.message);
  }

  return roundData;
}

export default fetchUserActiveGameRound;
