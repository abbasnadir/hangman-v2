import { supabase } from "../../app/lib/supabaseClient.js";
import type { Socket } from "socket.io";

export default async function disconnect(socket: Socket, reason: string) {
  if (!socket.data.user || !socket.data.user.currentRoundPlayerId) {
    return;
  }

  const get_total_players = await supabase
    .from("game_round_players")
    .select("id", { count: "exact", head: true })
    .eq("game_round_id", socket.data.user.currentRoundId);

  if (get_total_players.error) {
    console.error("Error fetching total players:", get_total_players.error);
    return;
  }

  const total_players = get_total_players.count || 0;

  if (total_players === 1) {
    await supabase
      .from("game_rounds")
      .update({ status: "abandoned" })
      .eq("id", socket.data.user.currentRoundId);

    await supabase
      .from("games")
      .update({ status: "abandoned" })
      .eq("id", socket.data.user.currentGameId);

    return;
  }

  await supabase
    .from("game_round_players")
    .update({ disconnected_at: new Date() })
    .eq("id", socket.data.user.currentRoundPlayerId);

  if (socket.data.user.currentGameId) {
    socket.to(socket.data.user.currentGameId).emit("game:player_disconnected", {
      userId: socket.data.user.id,
      reason,
    });
  }
}
