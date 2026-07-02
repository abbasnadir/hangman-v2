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

    const {
        connectToGame,
        startGame,
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
            setStatus('waiting');
            // Auto-start for single player
            startGame();
        } else {
            console.error('Failed to join game:', data.error);
            router.push('/');
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
    });

    useListener('game:player_lost', (data) => {
        setStatus('ended');
        setGameResult('lost');
        setWord(data.word);
    });

    useListener('game:player_completed', (data) => {
        setStatus('ended');
        setGameResult('completed');
    });

    const [nextRoundData, setNextRoundData] = useState<any>(null);

    useListener('game:next_round', (data) => {
        // Server emits this instantly. We will wait for new_round_ready for the payload details.
        setStatus('round_transition');
        setGameResult(data.roundResult || 'won');
        setWord(data.word || '');
        if (data.timeTakenMs) {
            setDisplayTime((data.timeTakenMs / 1000).toFixed(2) + 's');
        }
    });

    useListener('game:new_round_ready', (data) => {
        setNextRoundData(data);
    });

    const handleNextRound = () => {
        if (!nextRoundData || !nextRoundData.startTime) return;
        setStatus('playing');
        setGameResult(null);
        setWord('');
        setMaskedWord(nextRoundData.maskedWord || []);
        setPressedKeys(new Set());
        setLives(TOTAL_LIVES);
        if (nextRoundData.startTime) {
            setGameStartTime(nextRoundData.startTime);
        }
        setDisplayTime("0.00s");
        setNextRoundData(null);
    };

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

    if (status === 'connecting' || status === 'waiting') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
                <h2 className="text-3xl animate-pulse font-fredoka">Connecting to game...</h2>
            </div>
        );
    }

    if ((status === 'ended' || status === 'round_transition') && gameResult) {
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
                        onClick={handleKeyPress}
                    />
                ))}
            </div>
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
