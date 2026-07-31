import React from 'react';
import { Button } from "@/components/ui/Button";

interface Player {
    userId: string;
    username: string;
    pfp?: string;
    result: string;
    timeTakenMs: number;
    lives: number;
    score?: number;
}

interface EndedScreenProps {
    isFullyCompleted: boolean;
    word: string;
    finishedPlayers: Player[];
    lobbyPlayers: Array<{ userId: string; username: string }>;
    disconnectedPlayers: Set<string>;
    myUserId: string | null;
    nextRoundData: any;
    onNextRound: () => void;
    onLeaveGame: () => void;
}

export const EndedScreen: React.FC<EndedScreenProps> = ({
    isFullyCompleted,
    word,
    finishedPlayers,
    lobbyPlayers,
    disconnectedPlayers,
    myUserId,
    nextRoundData,
    onNextRound,
    onLeaveGame,
}) => {
    return (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="bg-[#251A3D] p-8 rounded-3xl border border-rose-500/30 text-center shadow-2xl flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300 min-w-[300px]">
                {!isFullyCompleted && <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>}
                <h2 className="text-3xl font-black text-white font-fredoka">
                    {isFullyCompleted ? "Round Complete!" : "Waiting for players..."}
                </h2>

                {word && (
                    <div className="flex flex-col items-center bg-black/40 rounded-xl py-3 px-6 border border-white/5 w-full">
                        <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">The word was</span>
                        <span className="text-2xl font-black text-white tracking-widest">{word}</span>
                    </div>
                )}
                
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
                    {lobbyPlayers
                        .filter(lp => !finishedPlayers.some(fp => fp.userId === lp.userId) && !disconnectedPlayers.has(lp.userId))
                        .map((lp, idx) => (
                        <div key={`playing-${idx}`} className="flex justify-between items-center py-2 px-2 opacity-50 border-t border-white/5">
                            <span className="text-white italic flex items-center gap-2 truncate max-w-[150px]">
                                <div className="w-3 h-3 border-2 border-violet-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
                                {lp.userId === myUserId ? 'You' : lp.username}
                            </span>
                            <span className="text-zinc-500 font-mono text-[10px] animate-pulse">Playing...</span>
                        </div>
                    ))}
                    {[...disconnectedPlayers].filter(id => !finishedPlayers.some(fp => fp.userId === id)).map((id, idx) => {
                        const lp = lobbyPlayers.find(p => p.userId === id);
                        return (
                        <div key={`disc-${idx}`} className="flex justify-between items-center py-2 px-2 opacity-30 border-t border-white/5">
                            <span className="text-white italic truncate max-w-[150px] line-through">{lp ? lp.username : 'Unknown'}</span>
                            <span className="text-rose-500/50 font-mono text-[10px]">Left</span>
                        </div>
                        );
                    })}
                </div>

                <div className="flex gap-4 w-full mt-2">
                    {isFullyCompleted && nextRoundData && (
                        <Button 
                            onClick={onNextRound}
                            variant="emerald"
                            className="flex-1"
                        >
                            Next Round
                        </Button>
                    )}
                    <Button 
                        onClick={onLeaveGame}
                        variant="secondary"
                        className="flex-1"
                    >
                        {isFullyCompleted ? "Main Menu" : "Leave Game"}
                    </Button>
                </div>
            </div>
        </div>
    );
};
