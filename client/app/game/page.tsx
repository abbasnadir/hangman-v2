'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { GameStatus } from '@/components/GameStatus';
import { WordDisplay } from '@/components/WordDisplay';
import { GameHeader } from '@/components/GameControls';
import { KeyboardRow, keyboardLayout } from '@/components/Keyboard';
import { useGameSocket } from '@/hooks/useGameSocket';

const TOTAL_LIVES = 5;

function HangmanGameClient() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const gameId = searchParams.get('id');

    const [status, setStatus] = useState<'connecting' | 'waiting' | 'playing' | 'round_transition' | 'ended'>('connecting');
    const [gameResult, setGameResult] = useState<'won' | 'lost' | 'abandoned' | 'completed' | null>(null);
    const [word, setWord] = useState(''); // The answer word (revealed at end)
    const [wordLength, setWordLength] = useState(0);
    const [lives, setLives] = useState(TOTAL_LIVES);
    const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
    const [displayTime, setDisplayTime] = useState("0.00s");
    const [showMultiplayerLeaderboard, setShowMultiplayerLeaderboard] = useState<boolean>(false);
    const [finishedPlayers, setFinishedPlayers] = useState<any[]>([]);
    const [isFullyCompleted, setIsFullyCompleted] = useState<boolean>(false);
    
    // In an online game, we don't know the full word until the end or we maintain a server-side verified word array.
    // For this frontend, we'll keep an array of correctly guessed letters. 
    // Since we don't know the word, we can't display correct positions immediately unless the server tells us.
    // Wait, the API doesn't send the hidden word structure until game start or move submission.
    // Looking at the server code, `game:submit_moves` returns `move_set` and `lives`.
    // Actually, in the old game, we knew the word locally. Here we don't.
    // But wait, the backend doesn't send the partial word array! It only sends `move_set`.
    // How does the client render the blanks? The client needs to know at least the word length or structure.
    // Let's assume we don't know it, so we'll just display a loading state or the guessed letters.
    // Wait, the backend logic for SinglePlayer classic has `this.word`.
    // It doesn't emit the word length. I will just render an empty board or wait.
    // For now, I will render the letters guessed. If I need the length, I might need an API change, but I can't change backend.
    // Let's just track guessed keys.
    const [maskedWord, setMaskedWord] = useState<string[]>([]);

    const [gameStartTime, setGameStartTime] = useState<number | null>(null);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status === 'playing' && gameStartTime) {
            interval = setInterval(() => {
                setDisplayTime(((Date.now() - gameStartTime) / 1000).toFixed(2) + 's');
            }, 100);
        }
        return () => clearInterval(interval);
    }, [status, gameStartTime]);

    const [modeId, setModeId] = useState<number | null>(null);
    const [isHost, setIsHost] = useState<boolean>(false);
    const [lobbyPlayersCount, setLobbyPlayersCount] = useState<number>(1);

    const {
        connectToGame,
        startGame,
        startNextRound,
        submitMove,
        leaveGame,
        useListener
    } = useGameSocket(gameId);

    useEffect(() => {
        if (!gameId) {
            router.push('/');
            return;
        }
        connectToGame();
        return () => leaveGame();
    }, [gameId, connectToGame, leaveGame, router]);

    useListener('game:join', (data) => {
        if (data.success) {
            if (data.reconnected && data.started) {
                setStatus('playing');
                setLives(data.lives ?? TOTAL_LIVES);
                setPressedKeys(new Set(data.move_set?.map((m: string) => m.toUpperCase()) || []));
                if (data.maskedWord) setMaskedWord(data.maskedWord);
                if (data.startTime) setGameStartTime(data.startTime);
            } else {
                setStatus('waiting');
            }
            
            const parsedModeId = Number(data.modeId);
            setModeId(parsedModeId);
            setIsHost(data.isHost);
            
            if (data.playersCount) {
                setLobbyPlayersCount(data.playersCount);
            }

            // Auto-start only for single player if not reconnected/started
            if (parsedModeId === 1 && !data.started) {
                startGame();
            }
        } else {
            console.error('Failed to join game:', data.error);
            router.push('/');
        }
    });

    useListener('game:player_joined', (data) => {
        if (data.playersCount) {
            setLobbyPlayersCount(data.playersCount);
        } else {
            setLobbyPlayersCount(prev => prev + 1);
        }
    });

    useListener('game:start', (data) => {
        if (data.success) {
            setStatus('playing');
            setLives(TOTAL_LIVES);
            setPressedKeys(new Set());
            if (data.maskedWord) {
                setMaskedWord(data.maskedWord);
            }
            if (data.startTime) {
                setGameStartTime(data.startTime);
            }
        } else {
            if (data.error === "This game has already been started.") {
                // Reconnection recovery: we tried to start it but it was already running.
                setStatus('playing');
                setLives(TOTAL_LIVES);
            } else {
                console.error('Failed to start game:', data.error);
            }
        }
    });

    useListener('game:started', (data) => {
        if (data.success) {
            setStatus('playing');
            setLives(TOTAL_LIVES);
            setPressedKeys(new Set());
            if (data.maskedWord) {
                setMaskedWord(data.maskedWord);
            }
            if (data.startTime) {
                setGameStartTime(data.startTime);
            } else if (data.timestamp) {
                setGameStartTime(new Date(data.timestamp).getTime());
            }
        }
    });

    useListener('game:submit_move', (data) => {
        if (data.success) {
            setLives(data.lives);
            setPressedKeys(new Set(data.move_set.map((m: string) => m.toUpperCase())));
            setDisplayTime((data.timeTakenMs / 1000).toFixed(2) + 's');
            
            if (data.maskedWord) {
                setMaskedWord(data.maskedWord);
            }
        }
    });

    useListener('game:player_won', (data) => {
        setStatus('ended');
        setGameResult('won');
        setWord(data.word);
        setDisplayTime((data.timeTakenMs / 1000).toFixed(2) + 's');
        if (modeId === 2) {
            setShowMultiplayerLeaderboard(true);
            setFinishedPlayers(prev => [...prev, { userId: data.userId || 'You', username: data.username || 'You', pfp: data.pfp, result: 'won', timeTakenMs: data.timeTakenMs, lives, score: data.score }]);
        }
    });

    useListener('game:player_lost', (data) => {
        setStatus('ended');
        setGameResult('lost');
        setWord(data.word);
        if (modeId === 2) {
            setShowMultiplayerLeaderboard(true);
            setFinishedPlayers(prev => [...prev, { userId: data.userId || 'You', username: data.username || 'You', pfp: data.pfp, result: 'lost', timeTakenMs: data.timeTakenMs || 0, lives: 0, score: data.score }]);
        }
    });

    useListener('game:player_completed', (data) => {
        setStatus('ended');
        setGameResult('completed');
        setDisplayTime((data.timeTakenMs / 1000).toFixed(2) + 's');
        if (modeId === 2) {
            setShowMultiplayerLeaderboard(true);
            setFinishedPlayers(prev => [...prev, { userId: data.userId || 'You', username: data.username || 'You', pfp: data.pfp, result: 'completed', timeTakenMs: data.timeTakenMs, lives, score: data.score }]);
        }
    });

    const [nextRoundData, setNextRoundData] = useState<any>(null);

    useListener('game:next_round', (data) => {
        setStatus('round_transition');
        setGameResult(data.roundResult);
        setWord(data.word);
        setDisplayTime((data.timeTakenMs / 1000).toFixed(2) + 's');
        if (modeId === 2) {
            setShowMultiplayerLeaderboard(true);
            setFinishedPlayers(prev => [...prev, { userId: data.userId || 'You', username: data.username || 'You', pfp: data.pfp, result: data.roundResult, timeTakenMs: data.timeTakenMs, lives, score: data.score }]);
        }
    });

    useListener('game:player_finished_broadcast', (data) => {
        setFinishedPlayers(prev => {
            if (prev.some(p => p.userId === data.userId)) {
                return prev.map(p => p.userId === data.userId ? data : p);
            }
            return [...prev, data];
        });
    });

    useListener('game:new_round_ready', (data) => {
        setNextRoundData(data);
        setIsFullyCompleted(true);
    });

    useListener('game:fully_completed', (data) => {
        setIsFullyCompleted(true);
        if (data && data.result) {
            setGameResult(data.result);
            setStatus('ended');
        }
    });

    const handleNextRound = () => {
        if (!nextRoundData || !nextRoundData.startTime) return;
        setStatus('playing');
        setGameResult(null);
        setWord('');
        setMaskedWord(nextRoundData.maskedWord || []);
        setLives(TOTAL_LIVES);
        setPressedKeys(new Set());
        setFinishedPlayers([]);
        setDisplayTime("0.00s");
        setNextRoundData(null);
        startNextRound();
    };

    useListener('game:started_round', (data) => {
        if (data.success && data.startTime) {
            setGameStartTime(data.startTime);
        }
    });

    const handleKeyPress = useCallback((key: string) => {
        if (status !== 'playing') return;
        
        const upperKey = key.toUpperCase();
        if (pressedKeys.has(upperKey)) return;

        // Optimistically add to pressed keys to prevent double-clicks
        setPressedKeys(prev => new Set(prev).add(upperKey));

        submitMove({
            guess: upperKey.toLowerCase(),
            timestamp: new Date()
        });
    }, [status, pressedKeys, submitMove]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toUpperCase();
            if (/^[A-Z]$/.test(key)) {
                handleKeyPress(key);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyPress]);

    const giveUp = () => {
        leaveGame();
        setStatus('ended');
        setGameResult('abandoned');
    };

    if (status === 'connecting' || (status === 'waiting' && modeId !== 2)) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
                <h2 className="text-3xl animate-pulse font-fredoka">Connecting to game...</h2>
            </div>
        );
    }

    if (status === 'waiting' && modeId === 2) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#171124] text-white">
                <div className="bg-[#251A3D] p-10 rounded-3xl border-t border-rose-500/30 text-center shadow-2xl flex flex-col gap-8 w-full max-w-md">
                    <h2 className="text-4xl font-black font-fredoka tracking-wider bg-clip-text text-transparent bg-gradient-to-br from-violet-400 to-emerald-400">MULTIPLAYER LOBBY</h2>
                    
                    <div className="bg-zinc-900/50 rounded-2xl p-6 border border-white/5">
                        <p className="text-zinc-400 font-bold tracking-widest uppercase text-sm mb-2">Players Joined</p>
                        <p className="text-5xl font-black text-white">{lobbyPlayersCount}</p>
                    </div>

                    <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5 flex flex-col gap-3">
                        <p className="text-zinc-400 font-bold tracking-widest uppercase text-sm">Share Invite Link</p>
                        <div className="flex gap-2">
                            <input 
                                readOnly 
                                value={typeof window !== 'undefined' ? window.location.href : ''} 
                                className="bg-black/50 text-zinc-300 text-sm px-3 py-2 rounded-lg w-full outline-none"
                            />
                            <button 
                                onClick={() => navigator.clipboard.writeText(window.location.href)}
                                className="bg-violet-600 hover:bg-violet-500 px-4 py-2 rounded-lg font-bold text-sm transition-colors"
                            >
                                Copy
                            </button>
                        </div>
                    </div>

                    {isHost ? (
                        <button 
                            onClick={startGame}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 transition-colors text-emerald-950 py-4 rounded-xl font-black uppercase tracking-widest text-lg shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                        >
                            Start Game
                        </button>
                    ) : (
                        <div className="bg-zinc-800/50 py-4 rounded-xl border border-white/5">
                            <p className="text-zinc-400 italic font-semibold animate-pulse">Waiting for host to start...</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if ((status === 'ended' || status === 'round_transition') && gameResult && !showMultiplayerLeaderboard) {
        return (
            <GameStatus
                result={gameResult!}
                word={word || '???'}
                time={displayTime}
                onMenu={() => router.push('/')}
                nextRound={status === 'round_transition'}
                nextRoundReady={!!nextRoundData?.startTime}
                onNextRound={handleNextRound}
            />
        );
    }

    const correctKeys = new Set(maskedWord.filter(c => c !== '_' && c !== ' ').map(c => c.toUpperCase()));
    const wrongKeys = new Set(Array.from(pressedKeys).filter(k => !correctKeys.has(k)));

    return (
        <div className="select-none bg-[#171124] flex flex-col items-center justify-between w-full min-h-dvh py-2 overflow-hidden relative">
            <GameHeader
                lives={lives}
                totalLives={TOTAL_LIVES}
                time={displayTime}
                onGiveUp={giveUp}
            />

            <WordDisplay 
                wordArr={maskedWord} 
                wordCount={maskedWord.join("").split(" ")} 
            />

            <div className="mb-4 overflow-x-auto sm:m-0 w-full px-2">
                {keyboardLayout.map((row, rowIndex) => (
                    <KeyboardRow
                        key={rowIndex}
                        row={row}
                        correctKeys={correctKeys}
                        wrongKeys={wrongKeys}
                        onClick={showMultiplayerLeaderboard ? () => {} : handleKeyPress}
                    />
                ))}
            </div>

            {showMultiplayerLeaderboard && (
                <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
                    <div className="bg-[#251A3D] p-8 rounded-3xl border border-rose-500/30 text-center shadow-2xl flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300 min-w-[300px]">
                        {!isFullyCompleted && <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>}
                        <h2 className="text-3xl font-black text-white font-fredoka">
                            {isFullyCompleted ? "Round Complete!" : "Waiting for players..."}
                        </h2>
                        
                        <div className="w-full bg-zinc-900/50 rounded-xl p-4 border border-white/5 max-h-[250px] overflow-y-auto">
                            <div className="flex justify-between items-center mb-2 px-2 pb-2 border-b border-white/10 text-xs font-bold text-zinc-400 uppercase tracking-widest">
                                <span>Player</span>
                                <span>Score / Time</span>
                            </div>
                            {[...finishedPlayers].sort((a, b) => (b.score || 0) - (a.score || 0) || a.timeTakenMs - b.timeTakenMs).map((p, idx) => (
                                <div key={idx} className="flex justify-between items-center py-2 px-2 rounded-lg hover:bg-white/5 transition-colors">
                                    <span className="text-white font-medium flex items-center gap-2">
                                        {p.pfp && <img src={p.pfp} alt="Avatar" className="w-6 h-6 rounded-full border border-white/20 object-cover" />}
                                        <span className="truncate max-w-[120px]">{p.username}</span>
                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${p.result === 'won' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                            {p.result}
                                        </span>
                                    </span>
                                    <div className="flex flex-col items-end">
                                        <span className="text-emerald-400 font-bold text-sm">{p.score || 0} wins</span>
                                        <span className="text-zinc-400 font-mono text-[10px]">{(p.timeTakenMs / 1000).toFixed(2)}s</span>
                                    </div>
                                </div>
                            ))}
                            {finishedPlayers.length < lobbyPlayersCount && (
                                <div className="flex justify-between items-center py-2 px-2 opacity-50">
                                    <span className="text-white italic">Waiting...</span>
                                    <span className="text-zinc-500 font-mono">--</span>
                                </div>
                            )}
                        </div>

                        {isFullyCompleted && (
                            <div className="flex gap-4 w-full mt-2">
                                {nextRoundData && (
                                    <button 
                                        onClick={() => {
                                            setShowMultiplayerLeaderboard(false);
                                            handleNextRound();
                                        }}
                                        className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black tracking-widest uppercase py-3 rounded-xl transition-colors"
                                    >
                                        Next Round
                                    </button>
                                )}
                                <button 
                                    onClick={() => router.push('/')}
                                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold uppercase tracking-widest py-3 rounded-xl transition-colors"
                                >
                                    Main Menu
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function GamePage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white"><h2 className="text-3xl font-fredoka">Loading...</h2></div>}>
            <HangmanGameClient />
        </Suspense>
    );
}
