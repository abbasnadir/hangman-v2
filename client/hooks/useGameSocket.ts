import { useEffect, useCallback, useRef, useState } from 'react';
import { socketService } from '../lib/socket/socketService';

export interface Move {
    guess: string;
    timestamp: Date | string;
}

export const useGameSocket = (gameId: string | null) => {
    const [isConnected, setIsConnected] = useState(false);
    
    const connectToGame = useCallback(async () => {
        if (!gameId) {
            console.log('[useGameSocket] No gameId provided.');
            return;
        }
        try {
            console.log(`[useGameSocket] Connecting to game: ${gameId}`);
            await socketService.connect();
            console.log(`[useGameSocket] Connected! Emitting game:join for ${gameId}`);
            setIsConnected(true);
            socketService.emit('game:join', { gameId });
        } catch (error) {
            console.error('[useGameSocket] Failed to connect socket:', error);
        }
    }, [gameId]);

    const startGame = useCallback(() => {
        console.log('[useGameSocket] Emitting game:start');
        socketService.emit('game:start', {});
    }, []);

    const submitMove = useCallback((move: Move) => {
        socketService.emit('game:submit_move', move);
    }, []);

    const leaveGame = useCallback(() => {
        console.log('[useGameSocket] Emitting game:leave and disconnecting');
        socketService.emit('game:leave', {});
        socketService.disconnect();
        setIsConnected(false);
    }, []);

    // Listeners setup helper
    const useListener = (event: string, callback: (data: any) => void) => {
        const savedCallback = useRef(callback);
        
        useEffect(() => {
            savedCallback.current = callback;
        }, [callback]);

        useEffect(() => {
            if (!isConnected) {
                console.log(`[useListener] Skipping setup for ${event} - socket not connected yet.`);
                return;
            }
            
            const listener = (data: any) => {
                console.log(`[Socket Event Received] ${event}:`, data);
                savedCallback.current(data);
            };
            
            const socket = socketService.getSocket();
            if (socket) {
                console.log(`[useListener] Registering listener for ${event}`);
                socket.on(event, listener);
                return () => {
                    console.log(`[useListener] Unregistering listener for ${event}`);
                    socket.off(event, listener);
                };
            } else {
                console.warn(`[useListener] Socket was unexpectedly null when setting up ${event}`);
            }
        }, [event, isConnected]);
    };

    return {
        connectToGame,
        startGame,
        submitMove,
        leaveGame,
        useListener,
        socketService,
        isConnected
    };
};
