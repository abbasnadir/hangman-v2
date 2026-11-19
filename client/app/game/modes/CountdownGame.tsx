import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { GameStatus } from '@/components/GameStatus';
import { PlayingScreen } from '../screens/PlayingScreen';

export interface CountdownGameProps {
    gameId: string;
    initialData: any;
    gameSocket: any; // The return value of useGameSocket
}

const DEFAULT_TIME_LIMIT_MS = 60_000;

const formatSeconds = (ms: number) => (Math.max(0, ms) / 1000).toFixed(1) + 's';

/**
 * Countdown ("reverse") mode: the clock counts down instead of up and wrong guesses
 * burn time instead of lives. The server owns the clock; every payload carries
 * `remainingMs`, which we turn into a local deadline so clock skew doesn't matter.
 */
export const CountdownGame: React.FC<CountdownGameProps> = ({ initialData, gameSocket }) => {
    const router = useRouter();
    const { submitMove, forfeitGame, startNextRound, useListener } = gameSocket;

    const [status, setStatus] = useState<'playing' | 'round_transition' | 'ended'>('playing');
    const [gameResult, setGameResult] = useState<'won' | 'lost' | 'abandoned' | 'completed' | null>(null);
    const [word, setWord] = useState('');
    const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set(initialData.move_set?.map((m: string) => m.toUpperCase()) || []));
    const [maskedWord, setMaskedWord] = useState<string[]>(initialData.maskedWord || []);
    const [nextRoundData, setNextRoundData] = useState<any>(null);
    const [lastPenalty, setLastPenalty] = useState<number | null>(null);

    const [timeLimitMs, setTimeLimitMs] = useState<number>(initialData.timeLimitMs || DEFAULT_TIME_LIMIT_MS);
    const penaltyMs: number = initialData.penaltyMs || 0;
    const [remainingMs, setRemainingMs] = useState<number>(initialData.remainingMs ?? timeLimitMs);
    const [running, setRunning] = useState<boolean>(!!initialData.started);
    const deadlineRef = useRef<number>(0);

    useEffect(() => {
        deadlineRef.current = Date.now() + (initialData.remainingMs ?? DEFAULT_TIME_LIMIT_MS);
    }, [initialData.remainingMs]);

    const syncClock = useCallback((data: any) => {
        if (typeof data?.timeLimitMs === 'number') setTimeLimitMs(data.timeLimitMs);
        if (typeof data?.remainingMs === 'number') {
            deadlineRef.current = Date.now() + data.remainingMs;
            setRemainingMs(data.remainingMs);
        }
    }, []);

    useEffect(() => {
        if (status !== 'playing' || !running) return;
        const interval = setInterval(() => {
            setRemainingMs(Math.max(0, deadlineRef.current - Date.now()));
        }, 100);
        return () => clearInterval(interval);
    }, [status, running]);

    useEffect(() => {
        if (lastPenalty === null) return;
        const t = setTimeout(() => setLastPenalty(null), 900);
        return () => clearTimeout(t);
    }, [lastPenalty]);

    useListener('game:start', (data: any) => {
        if (!data.success) return;
        setStatus('playing');
        setPressedKeys(new Set());
        if (data.maskedWord) setMaskedWord(data.maskedWord);
        syncClock(data);
        setRunning(true);
    });

    useListener('game:submit_move', (data: any) => {
        if (!data.success) return;
        setPressedKeys(new Set(data.move_set.map((m: string) => m.toUpperCase())));
        if (data.maskedWord) setMaskedWord(data.maskedWord);
        if (data.isCorrect === false && data.guess && penaltyMs) setLastPenalty(Date.now());
        syncClock(data);
    });

    const finishRound = (data: any, result: 'won' | 'lost' | 'completed', transition: boolean) => {
        setStatus(transition ? 'round_transition' : 'ended');
        setGameResult(result);
        if (data.word) setWord(data.word);
        setRunning(false);
        setRemainingMs(Math.max(0, deadlineRef.current - Date.now()));
    };

    useListener('game:player_won', (data: any) => finishRound(data, 'won', false));
    useListener('game:player_lost', (data: any) => finishRound(data, 'lost', false));
    useListener('game:player_completed', (data: any) => finishRound(data, 'completed', false));
    useListener('game:next_round', (data: any) => finishRound(data, data.roundResult, true));

    useListener('game:leave', (data: any) => {
        if (data.success) {
            setStatus('ended');
            setGameResult('abandoned');
            setRunning(false);
            if (data.word) setWord(data.word);
        }
    });

    useListener('game:new_round_ready', (data: any) => {
        setNextRoundData(data);
    });

    useListener('game:fully_completed', (data: any) => {
        if (!data) return;
        const mine = Array.isArray(data.leaderboard)
            ? data.leaderboard.find((p: any) => p.userId === initialData.userId)
            : null;
        if (mine?.result) setGameResult(mine.result);
        setStatus('ended');
        setRunning(false);
    });

    useListener('game:started_round', (data: any) => {
        if (!data.success) return;
        if (data.maskedWord) setMaskedWord(data.maskedWord);
        syncClock(data);
        setRunning(true);
    });

    const handleNextRound = () => {
        if (!nextRoundData || !nextRoundData.startTime) return;
        setStatus('playing');
        setGameResult(null);
        setWord('');
        setMaskedWord(nextRoundData.maskedWord || []);
        setPressedKeys(new Set());
        // Optimistically show a full clock; the server's started_round reply is authoritative.
        deadlineRef.current = Date.now() + timeLimitMs;
        setRemainingMs(timeLimitMs);
        setNextRoundData(null);
        startNextRound();
    };

    const handleKeyPress = useCallback((key: string) => {
        if (status !== 'playing' || !running || remainingMs <= 0) return;
        const upperKey = key.toUpperCase();
        if (pressedKeys.has(upperKey)) return;
        submitMove({ guess: upperKey.toLowerCase(), timestamp: new Date() });
    }, [status, running, remainingMs, pressedKeys, submitMove]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toUpperCase();
            if (/^[A-Z]$/.test(key)) handleKeyPress(key);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyPress]);

    if ((status === 'ended' || status === 'round_transition') && gameResult) {
        return (
            <GameStatus
                result={gameResult}
                word={word || '???'}
                time={formatSeconds(remainingMs)}
                timeLabel="Time Left"
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
        <PlayingScreen
            lives={0}
            totalLivesState={0}
            displayTime={formatSeconds(remainingMs)}
            onGiveUp={forfeitGame}
            maskedWord={maskedWord}
            correctKeys={correctKeys}
            wrongKeys={wrongKeys}
            onKeyPress={handleKeyPress}
            countdown={{ remainingMs, totalMs: timeLimitMs }}
            hangmanProgress={timeLimitMs > 0 ? 1 - remainingMs / timeLimitMs : 0}
        >
            {lastPenalty !== null && (
                <div
                    key={lastPenalty}
                    className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 text-rose-400 font-black font-mono text-2xl animate-bounce"
                >
                    -{(penaltyMs / 1000).toFixed(0)}s
                </div>
            )}
        </PlayingScreen>
    );
};
