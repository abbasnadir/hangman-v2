'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';
import { useGameSocket } from '@/hooks/useGameSocket';
import { ClassicGame } from './modes/ClassicGame';
import { MultiplayerGame } from './modes/MultiplayerGame';

function HangmanGameClient() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const gameId = searchParams.get('id');

    const [modeId, setModeId] = useState<number | null>(null);
    const [initialData, setInitialData] = useState<any>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const gameSocket = useGameSocket(gameId);
    const { connectToGame, leaveGame, useListener, startGame } = gameSocket;

    useEffect(() => {
        if (!gameId) {
            router.push('/');
            return;
        }
        connectToGame();
        return () => leaveGame();
    }, [gameId, connectToGame, leaveGame, router]);

    useListener('game:join', (data: any) => {
        if (data.success) {
            const parsedModeId = Number(data.modeId);
            setModeId(parsedModeId);
            setInitialData(data);

            // Auto-start only for single player if not reconnected/started
            if (parsedModeId === 1 && !data.started) {
                startGame();
            }
        } else {
            setErrorMessage(data.error);
            console.error('Failed to join game:', data.error);
            setTimeout(() => {
                router.push('/');
            }, 3000);
        }
    });

    if (errorMessage) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white flex-col gap-4">
                <h2 className="text-3xl font-fredoka text-rose-500">Error</h2>
                <p className="text-xl font-medium">{errorMessage}</p>
                <p className="text-zinc-500">Redirecting to home...</p>
            </div>
        );
    }

    if (modeId === null || !initialData) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
                <h2 className="text-3xl animate-pulse font-fredoka">Connecting to game...</h2>
            </div>
        );
    }

    if (modeId === 1) {
        return <ClassicGame gameId={gameId!} initialData={initialData} gameSocket={gameSocket} />;
    }

    if (modeId === 2) {
        return <MultiplayerGame gameId={gameId!} initialData={initialData} gameSocket={gameSocket} />;
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
            <h2 className="text-3xl font-fredoka text-rose-500">Unknown Game Mode</h2>
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
