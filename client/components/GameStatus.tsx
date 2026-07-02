'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Skull, Flag, Clock, ArrowRight, Home } from 'lucide-react';

type GameResult = 'won' | 'lost' | 'completed' | 'abandoned';

interface GameStatusProps {
  result: GameResult;
  word: string;
  time: string;
  onMenu: () => void;
  nextRound?: boolean;
  nextRoundReady?: boolean;
  onNextRound?: () => void;
}

export const GameStatus = ({
  result,
  word,
  time,
  onMenu,
  nextRound = false,
  nextRoundReady = true,
  onNextRound
}: GameStatusProps) => {

  const getStatusConfig = () => {
    switch (result) {
      case 'won':
      case 'completed':
        return {
          icon: <Trophy className="w-20 h-20 text-emerald-400" />,
          color: 'from-emerald-900/80 to-emerald-950/90',
          borderColor: 'border-emerald-500/30',
          title: result === 'won' ? 'VICTORY' : 'COMPLETED',
          subtitle: 'Brilliant deduction!'
        };
      case 'lost':
        return {
          icon: <Skull className="w-20 h-20 text-rose-400" />,
          color: 'from-rose-900/80 to-rose-950/90',
          borderColor: 'border-rose-500/30',
          title: 'DEFEAT',
          subtitle: 'Better luck next time!'
        };
      case 'abandoned':
        return {
          icon: <Flag className="w-20 h-20 text-zinc-400" />,
          color: 'from-zinc-800/80 to-zinc-950/90',
          borderColor: 'border-white/10',
          title: 'ABANDONED',
          subtitle: "You didn't even try :("
        };
      default:
        return {
          icon: <Flag className="w-20 h-20 text-zinc-400" />,
          color: 'from-zinc-800/80 to-zinc-950/90',
          borderColor: 'border-white/10',
          title: 'GAME OVER',
          subtitle: ''
        };
    }
  };

  const config = getStatusConfig();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        if (nextRound) {
            if (nextRoundReady && onNextRound) onNextRound();
        } else {
            onMenu();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMenu, nextRound, nextRoundReady, onNextRound]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center p-4 backdrop-blur-sm bg-black/60`}
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", bounce: 0.5 }}
        className={`w-full max-w-lg bg-gradient-to-b ${config.color} border ${config.borderColor} rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center`}
      >
        <motion.div 
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", delay: 0.2 }}
          className="mb-6 drop-shadow-2xl"
        >
          {config.icon}
        </motion.div>
        
        <h1 className="text-5xl font-black mb-2 tracking-widest text-white drop-shadow-md">
          {config.title}
        </h1>
        
        <p className="text-xl text-zinc-300 font-semibold mb-8">
          {config.subtitle}
        </p>

        <div className="w-full bg-black/40 rounded-2xl p-6 mb-8 border border-white/5 flex flex-col items-center gap-2">
          <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">The word was</p>
          <p className="text-4xl font-black text-white tracking-widest mb-4">{word}</p>
          
          <div className="flex items-center gap-2 bg-black/50 px-4 py-2 rounded-xl text-zinc-300 font-mono text-sm border border-white/5">
            <Clock className="w-4 h-4" />
            <span>Time Taken: {time}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row w-full gap-4">
          {nextRound ? (
            <button 
              onClick={nextRoundReady ? onNextRound : undefined}
              disabled={!nextRoundReady}
              className={`flex-1 flex items-center justify-center gap-3 rounded-full py-4 px-6 font-bold text-lg transition-all ${
                nextRoundReady 
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95 cursor-pointer' 
                  : 'bg-zinc-700 text-zinc-400 cursor-wait opacity-70'
              }`}
            >
              {nextRoundReady ? (
                <>Next Round <ArrowRight className="w-5 h-5" /></>
              ) : 'Preparing...'}
            </button>
          ) : (
            <button 
              onClick={onMenu}
              className="flex-1 flex items-center justify-center gap-3 bg-zinc-100 hover:bg-white text-zinc-900 rounded-full py-4 px-6 font-bold text-lg hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer"
            >
              <Home className="w-5 h-5" /> Main Menu
            </button>
          )}
        </div>
        
        <p className="mt-6 text-xs font-bold text-zinc-500 uppercase tracking-widest">
          Press ENTER to {nextRound ? 'continue' : 'return'}
        </p>
      </motion.div>
    </motion.div>
  );
};

GameStatus.displayName = "GameStatus";
