import type { Socket } from "socket.io";
import { getActivePlayersCount, getRoundPlayer, markPlayerAsActive, fetchRoundInfo, getWordlistWords, getGamePlayers, getUsedWordsInGame, insertGamePlayer, insertGameRoundPlayer, deleteGamePlayer, getProfile, getGameRoundPlayers } from "../../../../../shared/utils/dbQueries.js";
import { activeGameInstances } from "../../../core/registry.js";
import type { Multiplayer } from "../index.js";

async function getExistingLobbyPlayers(roundId: string, gameId: string, totalLives: number) {
    const roundPlayers = await getGameRoundPlayers(roundId);

    if (!roundPlayers || roundPlayers.length === 0) return [];
    
    const playerIds = roundPlayers.map((rp: any) => rp.user_id);
    const profiles = await Promise.all(playerIds.map((id: string) => getProfile(id)));

    return roundPlayers.map((rp: any) => {
        const p = profiles.find((prof: any) => prof?.id === rp.user_id);
        const playerState = activeGameInstances[gameId]?.players[rp.user_id];
        
        return {
            userId: rp.user_id,
            username: p?.username ?? "Player",
            pfp: p?.pfp ?? "",
            lives: playerState?.lives ?? totalLives,
            completed: playerState?.completed ?? false,
            timeTakenMs: playerState?.getTimeTaken(activeGameInstances[gameId]?.startedAt || 0) ?? 0,
            score: 0,
            disconnected: (playerState as any)?.disconnected ?? false,
        };
    });
}

export async function handleJoin(
    this: Multiplayer,
    socket: Socket,
    gameId: string,
    userId: string,
    dbData: any
) {
    const { gameStatus, existingPlayer, activeRounds } = dbData;
    const isHost = gameStatus.created_by === userId;
    const modeId = gameStatus.mode_id;

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

        if (!activeGameInstances[gameId]) {
            const [roundInfo, wordlistResult, gamePlayersData, usedRoundWords] = await Promise.all([
                fetchRoundInfo(socket.data.user.currentRoundId),
                getWordlistWords(gameStatus.wordlist_id).then(words => ({ data: { words } })),
                getGamePlayers(gameId).then(data => ({ data })),
                getUsedWordsInGame(gameId).then(data => ({ data })),
            ]);
            if (!roundInfo.error && roundInfo.data) {
                this.word = roundInfo.data.word;
                this.roundIndex = roundInfo.data.round_index;
                if (roundInfo.data.started_at) {
                    this.startedAt = new Date(roundInfo.data.started_at).getTime();
                }
            }
            this.wordlistWords = wordlistResult.data?.words ?? [];
            this.gamePlayerIds = (gamePlayersData.data ?? []).map((gp: any) => gp.user_id);
            this.usedWords = usedRoundWords.data ?? new Set<string>();
            
            const count = await getActivePlayersCount(socket.data.user.currentRoundId);
            this.totalPlayersCount = count;
            this.currentRoundId = socket.data.user.currentRoundId;
            activeGameInstances[gameId] = this;
        }

        let started = false;
        let maskedWord: string[] | undefined = undefined;
        let startTime: number | undefined = undefined;
        let lives = gameStatus.total_lives;
        let move_set: string[] = [];
        let playersCount = socket.data.user.currentRoundId 
            ? await getActivePlayersCount(socket.data.user.currentRoundId) 
            : (this.totalPlayersCount || 0);
        
        if (this.startedAt && gameStatus.status === 'in_progress') {
            if (this.abandonTimer) {
                clearTimeout(this.abandonTimer);
                delete this.abandonTimer;
            }

            if (!this.players[userId]) {
                socket.emit("game:join", { success: false, error: "You abandoned this game and cannot rejoin." });
                return;
            }

            if ((this.players[userId] as any).disconnected) {
                this.totalPlayersCount++;
                if (this.players[userId].completed) {
                    this.completedPlayersCount++;
                }
                (this.players[userId] as any).disconnected = false;
            }

            started = true;
            startTime = this.startedAt;
            lives = this.players[userId].lives;
            move_set = this.players[userId].move_set;
            maskedWord = this.getMaskedWord(userId);
            playersCount = this.totalPlayersCount;
        }

        const existingPlayers = socket.data.user.currentRoundId ? await getExistingLobbyPlayers(socket.data.user.currentRoundId, gameId, gameStatus.total_lives) : [];

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

    if (!activeRounds || activeRounds.length === 0) {
        socket.emit("game:join", { success: false, error: "No active round available to join." });
        return;
    }
    const roundToJoin = activeRounds[0];

    const [gpResult, rpResult] = await Promise.all([
        insertGamePlayer(gameId, userId),
        insertGameRoundPlayer(roundToJoin.id, userId)
    ]);

    if (gpResult.error) {
        socket.emit("game:join", { success: false, error: "Failed to join game: " + gpResult.error.message });
        return;
    }

    if (rpResult.error || !rpResult.data) {
        await deleteGamePlayer(gameId, userId);
        socket.emit("game:join", { success: false, error: "Failed to join round: " + rpResult.error?.message });
        return;
    }
    const newRoundPlayer = rpResult.data;

    socket.data.user.currentGameId = gameId;
    socket.data.user.currentRoundId = roundToJoin.id;
    socket.data.user.currentRoundPlayerId = newRoundPlayer.id;

    socket.join(gameId);

    const [playersCount, existingPlayers] = await Promise.all([
        getActivePlayersCount(roundToJoin.id),
        getExistingLobbyPlayers(roundToJoin.id, gameId, gameStatus.total_lives)
    ]); 

    if (!activeGameInstances[gameId]) {
        const [roundInfo, wordlistResult, gamePlayersData, usedRoundWords] = await Promise.all([
            fetchRoundInfo(socket.data.user.currentRoundId),
            getWordlistWords(gameStatus.wordlist_id).then(words => ({ data: { words } })),
            getGamePlayers(gameId).then(data => ({ data })),
            getUsedWordsInGame(gameId).then(data => ({ data })),
        ]);
        if (!roundInfo.error && roundInfo.data) {
            this.word = roundInfo.data.word;
            this.roundIndex = roundInfo.data.round_index;
            if (roundInfo.data.started_at) {
                this.startedAt = new Date(roundInfo.data.started_at).getTime();
            }
        }
        this.wordlistWords = wordlistResult.data?.words ?? [];
        this.gamePlayerIds = (gamePlayersData.data ?? []).map((gp: any) => gp.user_id);
        this.usedWords = usedRoundWords.data ?? new Set<string>();
        
        this.totalPlayersCount = playersCount;
        this.currentRoundId = socket.data.user.currentRoundId;
        activeGameInstances[gameId] = this;
    }

    socket.emit("game:join", { success: true, gameId, userId, reconnected: false, isHost, modeId, playersCount, username: socket.data.user.username, existingPlayers, totalLives: gameStatus.total_lives });
    socket.to(gameId).emit("game:player_joined", { userId, playersCount, existingPlayers, username: socket.data.user.username });
}
