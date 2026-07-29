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

export async function markPlayerAsDisconnectedByRound(roundId: string, userId: string) {
  // Unconditionally set left_at
  const { error: leftAtError } = await supabase
    .from("game_round_players")
    .update({ left_at: new Date().toISOString() })
    .eq("game_round_id", roundId)
    .eq("user_id", userId);

  if (leftAtError) {
    console.error(`Failed to set left_at for player ${userId} in round ${roundId}:`, leftAtError.message);
  }

  // Only mark as abandoned if the round hasn't naturally concluded for them
  const { error } = await supabase
    .from("game_round_players")
    .update({ result: 'abandoned' })
    .eq("game_round_id", roundId)
    .eq("user_id", userId)
    .is("result", null);

  if (error) {
    console.error(`Failed to set result to abandoned for player ${userId} in round ${roundId}:`, error.message);
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
    .eq("game_id", gameId)
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
    .update({ result, left_at: new Date().toISOString() })
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

export async function insertNewRound(gameId: string, roundIndex: number, word: string, id?: string) {
  const payload: Record<string, unknown> = {
    game_id: gameId,
    round_index: roundIndex,
    status: "in_progress",
    word: word,
    started_at: new Date().toISOString()
  };
  if (id) payload.id = id;
  const { data, error } = await supabase.from("game_rounds").insert(payload).select("id").single();

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

export async function getProfile(userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("id, username, pfp")
    .eq("id", userId)
    .single();
  return data ?? null;
}

export async function updateGameStatus(gameId: string, status: string, startedAt: string) {
  await supabase.from("games").update({ status, started_at: startedAt }).eq("id", gameId);
}

export async function updateRoundStatus(roundId: string, status: string, startedAt: string) {
  await supabase.from("game_rounds").update({ status, started_at: startedAt }).eq("id", roundId);
}


type ProfileUpdateLookup = {
  id: string;
  username: string;
  username_updated_at: string | null;
  pfp_updated_at: string | null;
};

export async function fetchUserWithUsername(
  username: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .is("deleted_at", null)
    .single();

  if (error && error.code !== "PGRST116") {
    //PGRST116 is the error code for "No rows found", which is expected if the username doesn't exist
    throw error;
  }

  return data;
}

export async function fetchUserWithId(
  userId: string,
): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .is("deleted_at", null)
    .single();

  if (error && error.code !== "PGRST116") {
    //PGRST116 is the error code for "No rows found", which is expected if the username doesn't exist
    throw error;
  }

  return data;
}

export async function fetchProfileUpdateContext(
  userId: string,
  username?: string,
): Promise<{
  currentProfile: ProfileUpdateLookup | null;
  usernameOwner: ProfileUpdateLookup | null;
}> {
  const columns = "id, username, username_updated_at, pfp_updated_at";

  if (!username) {
    const { data, error } = await supabase
      .from("profiles")
      .select(columns)
      .eq("id", userId)
      .is("deleted_at", null)
      .single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    return {
      currentProfile: data,
      usernameOwner: null,
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(columns)
    .or(`id.eq.${userId},username.eq.${JSON.stringify(username)}`)
    .is("deleted_at", null);

  if (error) {
    throw error;
  }

  return {
    currentProfile: data.find((profile) => profile.id === userId) ?? null,
    usernameOwner:
      data.find((profile) => profile.username === username) ?? null,
  };
}

export async function fetchGameStatus(gameId: string) {
  const { data, error } = await supabase
    .from("games")
    .select("status, mode_id, created_by, total_lives, wordlist_id, number_of_words")
    .eq("id", gameId)
    .single();
  return { data, error };
}

export async function fetchRoundInfo(roundId: string) {
  const { data, error } = await supabase
    .from("game_rounds")
    .select("word, round_index, started_at")
    .eq("id", roundId)
    .single();
  return { data, error };
}

export async function insertGamePlayer(gameId: string, userId: string) {
  const { error } = await supabase.from("game_players").insert({ game_id: gameId, user_id: userId });
  return { error };
}

export async function insertGameRoundPlayer(roundId: string, userId: string) {
  const { data, error } = await supabase
    .from("game_round_players")
    .insert({ game_round_id: roundId, user_id: userId })
    .select("id")
    .single();
  return { data, error };
}

export async function deleteGamePlayer(gameId: string, userId: string) {
  await supabase.from("game_players").delete().match({ game_id: gameId, user_id: userId });
}
export async function getGameRoundPlayers(roundId: string) { const { data } = await supabase.from("game_round_players").select("user_id").eq("game_round_id", roundId).is("left_at", null); return data; }
