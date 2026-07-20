import { supabase } from "../../app/lib/supabaseClient.js";

export async function fetchUserActiveGameRound(userId: string) {
  const { data: gameData, error: gameError } = await supabase
    .from("game_round_players")
    .select(
      `
                game_round_id,
                game_rounds!inner(status, game_id)
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
  // Unconditionally set left_at
  const { error: leftAtError } = await supabase
    .from("game_round_players")
    .update({ left_at: new Date().toISOString() })
    .eq("id", roundPlayerId);

  if (leftAtError) {
    console.error(`Failed to set left_at for player ${roundPlayerId}:`, leftAtError.message);
  }

  // Only mark as abandoned if the round hasn't naturally concluded for them
  const { error } = await supabase
    .from("game_round_players")
    .update({ result: 'abandoned' })
    .eq("id", roundPlayerId)
    .is("result", null);

  if (error) {
    console.error(`Failed to set result to abandoned for player ${roundPlayerId}:`, error.message);
  }
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
    .update({ status: "abandoned", finished_at: new Date().toISOString() })
    .eq("id", roundId)
    .in("status", ["in_progress"]);

  if (roundError) throw new Error(roundError.message);

  const { error: gameError } = await supabase
    .from("games")
    .update({ status: "abandoned", finished_at: new Date().toISOString() })
    .eq("id", gameId)
    .in("status", ["created", "in_progress"]);

  if (gameError) throw new Error(gameError.message);

  // Also properly mark the global game_players record as abandoned, only if it doesn't have a result
  await supabase
    .from("game_players")
    .update({ result: "abandoned" })
    .eq("game_id", gameId)
    .is("result", null);
}

export async function insertMove(moveToInsert: any) {
  const { error } = await supabase.from("moves").insert(moveToInsert);
  if (error) throw new Error(error.message);
}

export async function updateRoundPlayerResult(roundId: string, userId: string, result: string) {
  const { error } = await supabase
    .from("game_round_players")
    .update({ result })
    .eq("game_round_id", roundId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function finishGameRound(roundId: string) {
  const { error } = await supabase
    .from("game_rounds")
    .update({ status: "finished", finished_at: new Date().toISOString() })
    .eq("id", roundId);
  if (error) throw new Error(error.message);
}

export async function finishGame(gameId: string) {
  const { error } = await supabase
    .from("games")
    .update({ status: "finished", finished_at: new Date().toISOString() })
    .eq("id", gameId);
  if (error) throw new Error(error.message);
}

export async function updateGamePlayerResult(gameId: string, userId: string, result: string) {
  const { error } = await supabase
    .from("game_players")
    .update({ result })
    .eq("game_id", gameId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function getWordlistWords(wordlistId: string) {
  const { data, error } = await supabase.from("wordlists").select("words").eq("id", wordlistId).single();
  if (error) throw new Error(error.message);
  return data?.words || [];
}

export async function getUsedWordsInGame(gameId: string) {
  const { data, error } = await supabase.from("game_rounds").select("word").eq("game_id", gameId);
  if (error) throw new Error(error.message);
  return new Set((data || []).map(r => r.word?.toLowerCase()));
}

export async function insertNewRound(gameId: string, roundIndex: number, word: string) {
  const { data, error } = await supabase.from("game_rounds").insert({
    game_id: gameId,
    round_index: roundIndex,
    status: "in_progress",
    word: word,
    started_at: new Date().toISOString()
  }).select("id").single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getGamePlayers(gameId: string) {
  const { data, error } = await supabase.from("game_players").select("user_id").eq("game_id", gameId);
  if (error) throw new Error(error.message);
  return data;
}

export async function insertRoundPlayers(roundPlayersToInsert: any[]) {
  const { data, error } = await supabase.from("game_round_players").insert(roundPlayersToInsert).select("id, user_id");
  if (error) throw new Error(error.message);
  return data;
}

export default fetchUserActiveGameRound;
