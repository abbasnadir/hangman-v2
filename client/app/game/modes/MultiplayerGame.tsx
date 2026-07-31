import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { PlayingScreen } from '../screens/PlayingScreen';
import { WaitingScreen } from '../screens/WaitingScreen';
import { EndedScreen } from '../screens/EndedScreen';

export interface MultiplayerGameProps {
    gameId: string;
    initialData: any;
    gameSocket: any;
}

const TOTAL_LIVES = 5;

export const MultiplayerGame: React.FC<MultiplayerGameProps> = ({ gameId, initialData, gameSocket }) => {
    const router = useRouter();
    const { startGame, submitMove, forfeitGame, leaveGame, startNextRound, useListener, socketService } = gameSocket;

    const [status, setStatus] = useState<'waiting' | 'playing' | 'round_transition' | 'ended'>(
        initialData.reconnected && initialData.started ? 'playing' : 'waiting'
    );
    const [word, setWord] = useState('');
    const [lives, setLives] = useState(initialData.lives ?? TOTAL_LIVES);
    const [totalLivesState, setTotalLivesState] = useState(initialData.totalLives || TOTAL_LIVES);
    const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set(initialData.move_set?.map((m: string) => m.toUpperCase()) || []));
    const [maskedWord, setMaskedWord] = useState<string[]>(initialData.maskedWord || []);
    const [gameStartTime, setGameStartTime] = useState<number | null>(initialData.startTime || null);
    const [displayTime, setDisplayTime] = useState("0.00s");
    
    // Multiplayer specific state
    const [isHost, setIsHost] = useState<boolean>(initialData.isHost || false);
    const [lobbyPlayersCount, setLobbyPlayersCount] = useState<number>(initialData.playersCount || 1);
    const myUserIdRef = useRef<string | null>(initialData.userId || null);
    
    // Compute initial lobby players
    const getInitialLobbyPlayers = () => {
        const existing = Array.isArray(initialData.existingPlayers) ? initialData.existingPlayers : [];
        const myIndex = existing.findIndex((p: any) => p.userId === initialData.userId);
        if (myIndex !== -1) return existing;
        if (initialData.userId) return [{ userId: initialData.userId, username: initialData.username || 'You' }, ...existing];
        return existing;
    };
    
    const [lobbyPlayers, setLobbyPlayers] = useState<Array<{userId: string; username: string}>>(getInitialLobbyPlayers());
    const [errorMessage, setErrorMessage] = useState<string | null>(initialData.error || null);
    const [disconnectNotification, setDisconnectNotification] = useState<string | null>(null);
    const [disconnectedPlayers, setDisconnectedPlayers] = useState<Set<string>>(new Set());
    const [finishedPlayers, setFinishedPlayers] = useState<any[]>([]);
    const [showMultiplayerLeaderboard, setShowMultiplayerLeaderboard] = useState<boolean>(false);
    const [isFullyCompleted, setIsFullyCompleted] = useState<boolean>(false);
    const [nextRoundData, setNextRoundData] = useState<any>(null);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'playing' && gameStartTime) {
            interval = setInterval(() => {
                setDisplayTime(((Date.now() - gameStartTime) / 1000).toFixed(2) + 's');
            }, 100);
        }
        return () => clearInterval(interval);
    }, [status, gameStartTime]);

    useListener('game:player_joined', (data: any) => {
        if (data.playersCount) setLobbyPlayersCount(data.playersCount);
        else setLobbyPlayersCount(prev => prev + 1);
        
        if (data.existingPlayers && Array.isArray(data.existingPlayers)) {
            setLobbyPlayers(data.existingPlayers);
        } else if (data.userId && data.username) {
            setLobbyPlayers(prev => {
                if (prev.find(p => p.userId === data.userId)) return prev;
                return [...prev, { userId: data.userId, username: data.username }];
            });
        }
    });

    useListener('game:start', (data: any) => {
        if (data.success) {
            setStatus('playing');
            setLives(data.lives ?? TOTAL_LIVES);
            if (data.lives) setTotalLivesState(data.lives);
            setPressedKeys(new Set());
            if (data.maskedWord) setMaskedWord(data.maskedWord);
            if (data.startTime) setGameStartTime(data.startTime);
        } else {
            if (data.error === "This game has already been started.") {
                socketService.emit('game:join', { gameId });
            } else {
                setErrorMessage(data.error);
                setTimeout(() => setErrorMessage(null), 5000);
            }
        }
    });

    useListener('game:started', (data: any) => {
        if (data.success) {
            setStatus('playing');
            setLives(data.lives ?? TOTAL_LIVES);
            if (data.lives) setTotalLivesState(data.lives);
            setPressedKeys(new Set());
            if (data.maskedWord) setMaskedWord(data.maskedWord);
            if (data.startTime) setGameStartTime(data.startTime);
            else if (data.timestamp) setGameStartTime(new Date(data.timestamp).getTime());
        }
    });

    useListener('game:submit_move', (data: any) => {
        if (data.success) {
            setLives(data.lives);
            setPressedKeys(new Set(data.move_set.map((m: string) => m.toUpperCase())));
            setDisplayTime((data.timeTakenMs / 1000).toFixed(2) + 's');
            if (data.maskedWord) setMaskedWord(data.maskedWord);
        }
    });

    const handlePlayerFinish = (data: any, result: string) => {
        setStatus(result === 'round_transition' ? 'round_transition' : 'ended');
        if (data.word) setWord(data.word);
        if (data.timeTakenMs) setDisplayTime((data.timeTakenMs / 1000).toFixed(2) + 's');
        setShowMultiplayerLeaderboard(true);
        setFinishedPlayers(prev => {
            const newPlayer = { 
                userId: data.userId || myUserIdRef.current || 'You', 
                username: data.username || 'You', 
                pfp: data.pfp, 
                result: result === 'round_transition' ? data.roundResult : result, 
                timeTakenMs: data.timeTakenMs || 0, 
                lives: result === 'lost' ? 0 : lives, 
                score: data.score 
            };
            if (prev.some(p => p.userId === newPlayer.userId)) return prev.map(p => p.userId === newPlayer.userId ? newPlayer : p);
            return [...prev, newPlayer];
        });
    };

    useListener('game:player_won', (data: any) => handlePlayerFinish(data, 'won'));
    useListener('game:player_lost', (data: any) => handlePlayerFinish(data, 'lost'));
    useListener('game:player_completed', (data: any) => handlePlayerFinish(data, 'completed'));
    useListener('game:next_round', (data: any) => handlePlayerFinish(data, 'round_transition'));

    useListener('game:leave', (data: any) => {
        if (data.success) {
            setStatus('ended');
            if (data.word) setWord(data.word);
        }
    });

    useListener('game:player_finished_broadcast', (data: any) => {
        setFinishedPlayers(prev => {
            if (prev.some(p => p.userId === data.userId)) return prev.map(p => p.userId === data.userId ? data : p);
            return [...prev, data];
        });
    });

    useListener('game:new_round_ready', (data: any) => {
        setNextRoundData(data);
        setIsFullyCompleted(true);
    });

    useListener('game:fully_completed', (data: any) => {
        setIsFullyCompleted(true);
        if (data && data.result) setStatus('ended');
        if (data && data.leaderboard) {
            setShowMultiplayerLeaderboard(true);
            setFinishedPlayers(data.leaderboard.map((p: any) => ({
                userId: p.userId,
                username: p.username,
                pfp: p.pfp,
                score: p.score,
                timeTakenMs: p.totalTimeMs,
                lives: 0,
                result: 'completed'
            })));
        }
    });

    useListener('game:player_disconnected', (data: any) => {
        setDisconnectNotification(`${data.username || 'A player'} disconnected`);
        setTimeout(() => setDisconnectNotification(null), 5000);
        setDisconnectedPlayers(prev => new Set(prev).add(data.userId));
        setLobbyPlayers(prev => prev.filter(p => p.userId !== data.userId));
    });

    useListener('game:player_left', (data: any) => {
        setDisconnectNotification(`${data.username || 'A player'} left the game`);
        setTimeout(() => setDisconnectNotification(null), 5000);
        setDisconnectedPlayers(prev => new Set(prev).add(data.userId));
        setLobbyPlayers(prev => prev.filter(p => p.userId !== data.userId));
        if (data.playersCount !== undefined) setLobbyPlayersCount(data.playersCount);
    });

    useListener('game:started_round', (data: any) => {
        if (data.success && data.startTime) setGameStartTime(data.startTime);
    });

    const handleNextRound = () => {
        if (!nextRoundData || !nextRoundData.startTime) return;
        setShowMultiplayerLeaderboard(false);
        setGameStartTime(nextRoundData.startTime);
        setStatus('playing');
        setWord('');
        setMaskedWord(nextRoundData.maskedWord || []);
        setLives(nextRoundData.lives ?? TOTAL_LIVES);
        setPressedKeys(new Set());
        setFinishedPlayers([]);
        setDisplayTime("0.00s");
        setDisconnectedPlayers(new Set());
        setDisconnectNotification(null);
        setNextRoundData(null);
        setIsFullyCompleted(false);
        startNextRound();
    };

    const handleKeyPress = useCallback((key: string) => {
        if (status !== 'playing' || showMultiplayerLeaderboard) return;
        const upperKey = key.toUpperCase();
        if (pressedKeys.has(upperKey)) return;
        submitMove({ guess: upperKey.toLowerCase(), timestamp: new Date() });
    }, [status, pressedKeys, submitMove, showMultiplayerLeaderboard]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toUpperCase();
            if (/^[A-Z]$/.test(key)) handleKeyPress(key);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyPress]);

    if (status === 'waiting') {
        return (
            <WaitingScreen
                lobbyPlayersCount={lobbyPlayersCount}
                lobbyPlayers={lobbyPlayers}
                myUserId={myUserIdRef.current}
                errorMessage={errorMessage}
                isHost={isHost}
                onStartGame={startGame}
            />
        );
    }

    const correctKeys = new Set(maskedWord.filter(c => c !== '_' && c !== ' ').map(c => c.toUpperCase()));
    const wrongKeys = new Set(Array.from(pressedKeys).filter(k => !correctKeys.has(k)));

    return (
        <PlayingScreen
            disconnectNotification={disconnectNotification}
            lives={lives}
            totalLivesState={totalLivesState}
            displayTime={displayTime}
            onGiveUp={forfeitGame}
            maskedWord={maskedWord}
            correctKeys={correctKeys}
            wrongKeys={wrongKeys}
            onKeyPress={handleKeyPress}
        >
            {showMultiplayerLeaderboard && (
                <EndedScreen
                    isFullyCompleted={isFullyCompleted}
                    word={word}
                    finishedPlayers={finishedPlayers}
                    lobbyPlayers={lobbyPlayers}
                    disconnectedPlayers={disconnectedPlayers}
                    myUserId={myUserIdRef.current}
                    nextRoundData={nextRoundData}
                    onNextRound={handleNextRound}
                    onLeaveGame={() => router.push('/')}
                />
            )}
        </PlayingScreen>
    );
};
