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
        }
    });

    useListener('game:submit_move', (data) => {
        if (data.success) {
            setLives(data.lives);
            setPressedKeys(new Set(data.move_set.map((m: string) => m.toUpperCase())));
            setDisplayTime((data.timeTakenMs / 1000).toFixed(2) + 's');
            
            // Note: Since backend doesn't provide partial word structure, 
            // the UI will just rely on the end game events for the final word.
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

    useListener('game:next_round', (data) => {
        // Show the user they won the round, but disable the menu button
        setStatus('round_transition');
        
        // After 2.5 seconds, reset the board and start the next round
        setTimeout(() => {
            setStatus('playing');
            setGameResult(null);
            setWord('');
            setPressedKeys(new Set());
            setLives(TOTAL_LIVES);
            setDisplayTime("0.00s");
        }, 2500);
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

    if (status === 'connecting' || status === 'waiting') {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[url('/background.jpg')] bg-cover text-white">
                <h2 className="text-3xl animate-pulse">Connecting to game...</h2>
            </div>
        );
    }

    if ((status === 'ended' || status === 'round_transition') && gameResult) {
        return (
            <GameStatus
                result={gameResult}
                word={word || '???'}
                time={displayTime}
                onMenu={() => router.push('/')}
                nextRound={status === 'round_transition'}
            />
        );
    }

    return (
        <div className="select-none bg-[url('/background.jpg')] bg-no-repeat bg-cover flex flex-col items-center justify-between w-full min-h-dvh py-2 overflow-hidden">
            <GameHeader
                lives={lives}
                totalLives={TOTAL_LIVES}
                time={displayTime}
                onGiveUp={giveUp}
            />

            {/* We don't have the word layout from backend yet in v2, so we show a generic playing indicator instead of WordDisplay */}
            <div className="my-8 flex-1 flex flex-col items-center justify-center text-center px-4">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-white drop-shadow-md bg-white/20 px-8 py-4 rounded-xl">
                    Guess the word!
                </h2>
                <p className="mt-4 text-lg text-gray-700 dark:text-gray-300 font-semibold drop-shadow-sm">
                    {pressedKeys.size} letters tried
                </p>
            </div>

            <div className="mb-4 overflow-x-scroll sm:m-0 w-full">
                {keyboardLayout.map((row, rowIndex) => (
                    <KeyboardRow
                        key={rowIndex}
                        row={row}
                        pressedKeys={pressedKeys}
                        onClick={handleKeyPress}
                    />
                ))}
            </div>
        </div>
    );
}

export default function GamePage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[url('/background.jpg')] bg-cover text-white"><h2 className="text-3xl">Loading...</h2></div>}>
            <HangmanGameClient />
        </Suspense>
    );
}
