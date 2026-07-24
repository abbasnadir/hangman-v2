import { z } from "zod";
import type { Socket } from "socket.io";
import { supabase } from "../../../app/lib/supabaseClient.js";
import {
  checkUserInGame,
  getActivePlayersCount,
  getRoundPlayer,
  markPlayerAsActive,
  fetchUserActiveGameRound,
  fetchActiveRound,
} from "../../../shared/utils/dbQueries.js";
import { Classic } from "../modes/Classic/index.js";
import { Multiplayer } from "../modes/Multiplayer/index.js";
import { Player } from "../core/Player.js";
import type { GameMode } from "../core/GameMode.js";
import { joinGamePayloadSchema } from "../../schemas/gameProcessSchema.js";
import { activeGameInstances } from "../utils/registry.js";

async function getExistingLobbyPlayers(roundId: string) {
    const { data: roundPlayers, error } = await supabase
        .from("game_round_players")
        .select("user_id")
        .eq("game_round_id", roundId)
        .is("left_at", null);

    if (error || !roundPlayers || roundPlayers.length === 0) return [];
    
    const userIds = roundPlayers.map((rp: any) => rp.user_id);
    
    const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.username]));

    return userIds.map(uid => ({
        userId: uid,
        username: profileMap.get(uid) || "Player"
    }));
}

export const joinHandler = async (socket: Socket, payload: unknown) => {
    const { gameId } = payload as z.infer<typeof joinGamePayloadSchema>;
    const userId = socket.data.user.id;

    const profilePromise = !socket.data.user.username 
        ? supabase.from('profiles').select('username, pfp').eq('id', userId).single()
        : Promise.resolve({ data: null, error: null });

    const gameStatusPromise = supabase
        .from("games")
        .select("status, mode_id, created_by, total_lives, wordlist_id, number_of_words")
        .eq("id", gameId)
        .single();

    const otherGamesPromise = fetchUserActiveGameRound(userId);
    const existingPlayerPromise = checkUserInGame(gameId, userId).catch(e => {
        console.error("checkUserInGame:", e);
        return null;
    });
    const activeRoundsPromise = fetchActiveRound(gameId);

    const [
        { data: profile },
        { data: gameStatus, error: gameStatusError },
        otherGames,
        existingPlayer,
        activeRounds
    ] = await Promise.all([
        profilePromise,
        gameStatusPromise,
        otherGamesPromise,
        existingPlayerPromise,
        activeRoundsPromise
    ]);

    if (profile) {
        socket.data.user.username = profile.username ?? "Player";
        socket.data.user.pfp = profile.pfp ?? "";
    }

    // 1. Game must exist and be joinable
    if (gameStatusError || !gameStatus) {
        socket.emit("game:join", { success: false, error: "Game not found." });
        return;
    }
    if (gameStatus.status === "abandoned" || gameStatus.status === "finished") {
        socket.emit("game:join", { success: false, error: "This game is no longer active." });
        return;
    }

    const isHost = gameStatus.created_by === userId;
    const modeId = gameStatus.mode_id;

    // 2. User must not be in a different active game
    if (otherGames && otherGames.length > 0) {
        const rounds: any = otherGames[0]?.game_rounds;
        const activeGameId = Array.isArray(rounds) ? rounds[0]?.game_id : rounds?.game_id;
        if (activeGameId && activeGameId !== gameId) {
            socket.emit("game:join", { success: false, error: "You're already in another active game." });
            return;
        }
    }

    // 3. Handle reconnecting player
    if (existingPlayer) {
        socket.join(gameId);

        if (activeRounds && activeRounds.length > 0) {
            const round = activeRounds[0];
            const roundPlayer = await getRoundPlayer(round.id, userId).catch(() => null);
            if (roundPlayer) await markPlayerAsActive(roundPlayer.id).catch(console.error);

            socket.data.user.currentGameId = gameId;
            socket.data.user.currentRoundId = round.id;
            socket.data.user.currentRoundPlayerId = roundPlayer?.id ?? null;
        }

        // Ensure a GameMode instance exists for this game (recreate if missing)
        if (!activeGameInstances[gameId]) {
            const gameMode: GameMode = modeId === 2 ? new Multiplayer(gameStatus.total_lives) : new Classic(gameStatus.total_lives);
            // Load minimal state from DB (word, round index, startedAt) + caches
            const [roundInfo, wordlistResult, gamePlayersData, usedRoundWords] = await Promise.all([
                supabase.from("game_rounds").select("word, round_index, started_at").eq("id", socket.data.user.currentRoundId).single(),
                supabase.from("wordlists").select("words").eq("id", gameStatus.wordlist_id).single(),
                supabase.from("game_players").select("user_id").eq("game_id", gameId),
                supabase.from("game_rounds").select("word").eq("game_id", gameId),
            ]);
            if (!roundInfo.error && roundInfo.data) {
                gameMode.word = roundInfo.data.word;
                gameMode.roundIndex = roundInfo.data.round_index;
                if (roundInfo.data.started_at) {
                    gameMode.startedAt = new Date(roundInfo.data.started_at).getTime();
                }
            }
            // Populate in-memory caches
            gameMode.wordlistWords = wordlistResult.data?.words ?? [];
            gameMode.gamePlayerIds = (gamePlayersData.data ?? []).map(gp => gp.user_id);
            gameMode.usedWords = new Set((usedRoundWords.data ?? []).map(r => r.word.toLowerCase()));
            
            // Set total player count based on current active players
            const count = await getActivePlayersCount(socket.data.user.currentRoundId);
            gameMode.totalPlayersCount = count;
            gameMode.currentRoundId = socket.data.user.currentRoundId;
            activeGameInstances[gameId] = gameMode;
        }

        const gameMode = activeGameInstances[gameId];
        let started = false;
        let maskedWord: string[] | undefined = undefined;
        let startTime: number | undefined = undefined;
        let lives = gameStatus.total_lives;
        let move_set: string[] = [];
        let playersCount = gameMode ? gameMode.totalPlayersCount : 0;
        if (!started && socket.data.user.currentRoundId) {
            playersCount = await getActivePlayersCount(socket.data.user.currentRoundId);
        }
        
        if (gameMode && gameMode.startedAt && gameStatus.status === 'in_progress') {
            started = true;
            startTime = gameMode.startedAt;
            maskedWord = gameMode.getMaskedWord(userId);
            
            // Try to restore player state if not in memory
            if (!gameMode.players[userId]) {
                const { data: moves } = await supabase.from('moves').select('guess, correct, created_at').eq('round_id', socket.data.user.currentRoundId).eq('user_id', userId).order('created_at', { ascending: true });
                if (moves) {
                    const player = new Player(userId, gameStatus.total_lives);
                    const targetLetters = new Set(gameMode.word.toLowerCase().replace(/[^a-z]/g, ""));
                    for (const move of moves) {
                        player.recordGuess(move.guess, move.correct, startTime || Date.now());
                        if (move.correct || player.lives <= 0) {
                            const allGuessed = [...targetLetters].every(l => player.move_set.includes(l));
                            if (allGuessed || player.lives <= 0) {
                                if (!player.completed) {
                                    player.completed = true;
                                    player.finalTime = move.created_at ? new Date(move.created_at).getTime() - (startTime || 0) : 0;
                                    gameMode.completedPlayersCount++;
                                }
                            }
                        }
                    }
                    gameMode.players[userId] = player;
                }
            }
            
            if (gameMode.players[userId]) {
                lives = gameMode.players[userId].lives;
                move_set = gameMode.players[userId].move_set;
                maskedWord = gameMode.getMaskedWord(userId); // update after player reconstruction
            }
        }

        const existingPlayers = socket.data.user.currentRoundId ? await getExistingLobbyPlayers(socket.data.user.currentRoundId) : [];

        socket.emit("game:join", { 
            success: true, 
            gameId, 
            userId,
            reconnected: true, 
            isHost, 
            modeId,
            playersCount,
            started,
            maskedWord,
            startTime,
            lives,
            move_set,
            username: socket.data.user.username,
            existingPlayers,
            totalLives: gameStatus.total_lives
        });
        socket.to(gameId).emit("game:player_joined", { userId, playersCount, username: socket.data.user.username });
        return;
    }

    // 4. New player — find the active round to join
    if (!activeRounds || activeRounds.length === 0) {
        socket.emit("game:join", { success: false, error: "No active round available to join." });
        return;
    }
    const roundToJoin = activeRounds[0];

    // 5. Insert player into game_players and game_round_players
    const [gpResult, rpResult] = await Promise.all([
        supabase.from("game_players").insert({ game_id: gameId, user_id: userId }),
        supabase.from("game_round_players").insert({ game_round_id: roundToJoin.id, user_id: userId }).select("id").single()
    ]);

    if (gpResult.error) {
        socket.emit("game:join", { success: false, error: "Failed to join game: " + gpResult.error.message });
        return;
    }

    if (rpResult.error || !rpResult.data) {
        await supabase.from("game_players").delete().match({ game_id: gameId, user_id: userId });
        socket.emit("game:join", { success: false, error: "Failed to join round: " + rpResult.error?.message });
        return;
    }
    const newRoundPlayer = rpResult.data;

    // Set synchronously to prevent race conditions
    socket.data.user.currentGameId = gameId;
    socket.data.user.currentRoundId = roundToJoin.id;
    socket.data.user.currentRoundPlayerId = newRoundPlayer.id;

    socket.join(gameId);

    const [playersCount, existingPlayers] = await Promise.all([
        getActivePlayersCount(roundToJoin.id),
        getExistingLobbyPlayers(roundToJoin.id)
    ]); 

    socket.emit("game:join", { success: true, gameId, userId, reconnected: false, isHost, modeId, playersCount, username: socket.data.user.username, existingPlayers, totalLives: gameStatus.total_lives });
    socket.to(gameId).emit("game:player_joined", { userId, playersCount, existingPlayers, username: socket.data.user.username });
};
