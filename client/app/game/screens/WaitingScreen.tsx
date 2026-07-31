import React from 'react';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface WaitingScreenProps {
    lobbyPlayersCount: number;
    lobbyPlayers: Array<{ userId: string; username: string }>;
    myUserId: string | null;
    errorMessage: string | null;
    isHost: boolean;
    onStartGame: () => void;
}

export const WaitingScreen: React.FC<WaitingScreenProps> = ({
    lobbyPlayersCount,
    lobbyPlayers,
    myUserId,
    errorMessage,
    isHost,
    onStartGame,
}) => {
    return (
        <div className="flex min-h-screen items-center justify-center bg-[#171124] text-white">
            <div className="bg-[#251A3D] p-10 rounded-3xl border-t border-rose-500/30 text-center shadow-2xl flex flex-col gap-8 w-full max-w-md">
                <h2 className="text-4xl font-black font-fredoka tracking-wider bg-clip-text text-transparent bg-gradient-to-br from-violet-400 to-emerald-400">MULTIPLAYER LOBBY</h2>
                
                {errorMessage && (
                    <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-xl text-sm font-bold shadow-lg animate-in fade-in zoom-in">
                        {errorMessage}
                    </div>
                )}

                <div className="bg-zinc-900/50 rounded-2xl p-6 border border-white/5">
                    <p className="text-zinc-400 font-bold tracking-widest uppercase text-sm mb-3">Players Joined ({lobbyPlayersCount})</p>
                    <div className="flex flex-col gap-2">
                        {lobbyPlayers.map(p => (
                            <div key={p.userId} className="flex items-center gap-2 bg-zinc-800/50 px-3 py-2 rounded-lg">
                                <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                                <span className="text-white font-semibold text-sm">{p.username}</span>
                                {p.userId === myUserId && <span className="text-zinc-500 text-xs">(you)</span>}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-zinc-900/50 rounded-2xl p-4 border border-white/5 flex flex-col gap-3">
                    <p className="text-zinc-400 font-bold tracking-widest uppercase text-sm">Share Invite Link</p>
                    <div className="flex gap-2">
                        <Input 
                            readOnly 
                            value={typeof window !== 'undefined' ? window.location.href : ''} 
                        />
                        <Button 
                            onClick={() => navigator.clipboard.writeText(window.location.href)}
                            variant="primary"
                        >
                            Copy
                        </Button>
                    </div>
                </div>

                {isHost ? (
                    <Button 
                        onClick={onStartGame}
                        variant="emerald"
                        className="w-full"
                    >
                        Start Game
                    </Button>
                ) : (
                    <div className="bg-zinc-800/50 py-4 rounded-xl border border-white/5">
                        <p className="text-zinc-400 italic font-semibold animate-pulse">Waiting for host to start...</p>
                    </div>
                )}
            </div>
        </div>
    );
};
