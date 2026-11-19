'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, HeartCrack, Flag, Hourglass } from 'lucide-react';

export interface CountdownState {
  remainingMs: number;
  totalMs: number;
}

interface GameHeaderProps {
  lives: number;
  totalLives: number;
  time: string;
  onGiveUp: () => void;
  /** When set, a draining time bar replaces the hearts (Countdown mode). */
  countdown?: CountdownState;
}

const CountdownBar = ({ remainingMs, totalMs }: CountdownState) => {
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;
  const urgent = remainingMs <= 10_000;
  const color = fraction > 0.5 ? 'bg-emerald-400' : fraction > 0.2 ? 'bg-amber-400' : 'bg-rose-500';

  return (
    <div className="flex items-center gap-3 bg-black/20 rounded-full px-4 py-2 border border-white/5">
      <Hourglass className={`w-6 h-6 sm:w-7 sm:h-7 ${urgent ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
      <div className="w-24 sm:w-40 h-3 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-[width] duration-100 ease-linear`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
};

const Hearts = ({ lives, totalLives }: { lives: number; totalLives: number }) => (
  <div className="flex items-center bg-black/20 rounded-full px-4 py-2 border border-white/5">
    <AnimatePresence>
      {[...Array(Math.max(0, totalLives))].map((_, i) => {
        const isAlive = i < lives;
        return (
          <div key={`heart-${i}`} className="relative mr-2 last:mr-0">
            {isAlive ? (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", bounce: 0.5 }}
              >
                <Heart className="w-6 h-6 sm:w-8 sm:h-8 text-rose-500 fill-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
              </motion.div>
            ) : (
              <motion.div
                initial={{ scale: 1.5, opacity: 0, rotate: -45 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ duration: 0.3 }}
              >
                <HeartCrack className="w-6 h-6 sm:w-8 sm:h-8 text-zinc-600" />
              </motion.div>
            )}
          </div>
        );
      })}
    </AnimatePresence>
  </div>
);

export const GameHeader = ({
  lives,
  totalLives,
  time,
  onGiveUp,
  countdown
}: GameHeaderProps) => (
  <div className="flex w-full justify-between items-center p-4 sm:p-8 pt-4">
    {countdown ? <CountdownBar {...countdown} /> : <Hearts lives={lives} totalLives={totalLives} />}

    <div className={`bg-black/30 backdrop-blur-sm px-6 py-2 rounded-full border border-white/5 text-xl font-bold font-mono tracking-wider shadow-inner ${countdown && countdown.remainingMs <= 10_000 ? 'text-rose-400' : 'text-white'}`}>
      {time}
    </div>

    <button 
      onClick={onGiveUp} 
      className="flex items-center gap-2 bg-rose-500 hover:bg-rose-400 text-rose-950 font-bold px-4 py-2 rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_10px_rgba(244,63,94,0.3)]"
    >
      <Flag className="w-4 h-4 sm:w-5 sm:h-5" /> 
      <span className="hidden sm:inline">FORFEIT</span>
    </button>
  </div>
);
