import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { GameStatus } from '@/components/GameStatus';
import { PlayingScreen } from '../screens/PlayingScreen';

export interface ClassicGameProps {
    gameId: string;
    initialData: any;
    gameSocket: any; // The return value of useGameSocket
}

const TOTAL_LIVES = 5;

export const ClassicGame: React.FC<ClassicGameProps> = ({ gameId, initialData, gameSocket }) => {
    const router = useRouter();
    const { submitMove, forfeitGame, startNextRound, useListener, socketService } = gameSocket;

    const [status, setStatus] = useState<'playing' | 'round_transition' | 'ended'>(
        initialData.reconnected && initialData.started ? 'playing' : 'playing' // single player starts immediately or is playing
    );
    const [gameResult, setGameResult] = useState<'won' | 'lost' | 'abandoned' | 'completed' | null>(null);
    const [word, setWord] = useState('');
    const [lives, setLives] = useState(initialData.lives ?? TOTAL_LIVES);
    const [totalLivesState, setTotalLivesState] = useState(initialData.totalLives || TOTAL_LIVES);
    const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set(initialData.move_set?.map((m: string) => m.toUpperCase()) || []));
    const [maskedWord, setMaskedWord] = useState<string[]>(initialData.maskedWord || []);
    const [gameStartTime, setGameStartTime] = useState<number | null>(initialData.startTime || null);
    const [displayTime, setDisplayTime] = useState("0.00s");
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

    useListener('game:start', (data: any) => {
        if (data.success) {
            setStatus('playing');
            setLives(data.lives ?? TOTAL_LIVES);
            if (data.lives) setTotalLivesState(data.lives);
            setPressedKeys(new Set());
            if (data.maskedWord) setMaskedWord(data.maskedWord);
            if (data.startTime) setGameStartTime(data.startTime);
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

    useListener('game:player_won', (data: any) => {
        setStatus('ended');
        setGameResult('won');
        setWord(data.word);
        setDisplayTime((data.timeTakenMs / 1000).toFixed(2) + 's');
    });

    useListener('game:player_lost', (data: any) => {
        setStatus('ended');
        setGameResult('lost');
        setWord(data.word);
    });

    useListener('game:leave', (data: any) => {
        if (data.success) {
            setStatus('ended');
            setGameResult('abandoned');
            if (data.word) setWord(data.word);
        }
    });

    useListener('game:player_completed', (data: any) => {
        setStatus('ended');
        setGameResult('completed');
        if (data.word) setWord(data.word);
        setDisplayTime((data.timeTakenMs / 1000).toFixed(2) + 's');
    });

    useListener('game:next_round', (data: any) => {
        setStatus('round_transition');
        setGameResult(data.roundResult);
        setWord(data.word);
        setDisplayTime((data.timeTakenMs / 1000).toFixed(2) + 's');
    });

    useListener('game:new_round_ready', (data: any) => {
        setNextRoundData(data);
    });

    useListener('game:fully_completed', (data: any) => {
        if (data && data.result) {
            setGameResult(data.result);
            setStatus('ended');
        }
    });

    useListener('game:started_round', (data: any) => {
        if (data.success && data.startTime) {
            setGameStartTime(data.startTime);
        }
    });

    const handleNextRound = () => {
        if (!nextRoundData || !nextRoundData.startTime) return;
        setGameStartTime(nextRoundData.startTime);
        setStatus('playing');
        setGameResult(null);
        setWord('');
        setMaskedWord(nextRoundData.maskedWord || []);
        setLives(nextRoundData.lives ?? TOTAL_LIVES);
        setPressedKeys(new Set());
        setDisplayTime("0.00s");
        setNextRoundData(null);
        startNextRound();
    };

    const handleKeyPress = useCallback((key: string) => {
        if (status !== 'playing') return;
        const upperKey = key.toUpperCase();
        if (pressedKeys.has(upperKey)) return;
        submitMove({ guess: upperKey.toLowerCase(), timestamp: new Date() });
    }, [status, pressedKeys, submitMove]);

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
        <PlayingScreen
            lives={lives}
            totalLivesState={totalLivesState}
            displayTime={displayTime}
            onGiveUp={forfeitGame}
            maskedWord={maskedWord}
            correctKeys={correctKeys}
            wrongKeys={wrongKeys}
            onKeyPress={handleKeyPress}
        />
    );
};
