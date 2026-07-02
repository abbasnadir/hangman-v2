'use client';

import { motion, AnimatePresence } from 'framer-motion';

const LetterTile = ({ char }: { char: string }) => {
  const isRevealed = char !== '_' && char !== ' ';
  const isSpace = char === ' ';

  if (isSpace) {
      return <div className="w-4 sm:w-8 shrink-0" />;
  }

  return (
      <div className="relative w-10 h-12 sm:w-14 sm:h-16 md:w-16 md:h-20 shrink-0" style={{ perspective: '1000px' }}>
          <AnimatePresence mode="wait">
              {isRevealed ? (
                  <motion.div
                      key="revealed"
                      initial={{ rotateX: 90, opacity: 0 }}
                      animate={{ rotateX: 0, opacity: 1 }}
                      transition={{ duration: 0.15, type: 'spring', stiffness: 300, damping: 20 }}
                      className="absolute inset-0 bg-emerald-500 rounded-xl border-b-4 border-emerald-700 shadow-md flex items-center justify-center text-2xl sm:text-4xl font-black text-white uppercase"
                  >
                      {char}
                  </motion.div>
              ) : (
                  <motion.div
                      key="hidden"
                      exit={{ rotateX: -90, opacity: 0 }}
                      transition={{ duration: 0.1 }}
                      className="absolute inset-0 bg-[#251A3D] rounded-xl border-b-4 border-[#1e1531] shadow-md flex items-center justify-center"
                  >
                      <div className="w-1/2 h-1 bg-white/10 rounded-full" />
                  </motion.div>
              )}
          </AnimatePresence>
      </div>
  );
};

export const WordDisplay = ({
  wordArr,
  wordCount
}: {
  wordArr: (string | '_' | ' ')[];
  wordCount: string[];
}) => (
  <div className="my-8 flex flex-col items-center w-full px-4">
    <div className="flex flex-wrap justify-center gap-y-4 font-fredoka">
      {wordArr.map((c, i) => (
        <LetterTile key={i} char={c} />
      ))}
    </div>
    
    <div className="flex justify-center flex-wrap gap-8 text-sm sm:text-lg font-bold text-zinc-500 mt-6 tracking-widest uppercase">
      {wordCount.map((c, i) => (
        <span key={i} className="flex justify-center items-center px-4 py-1 bg-black/20 rounded-full">
          {c.length} Letters
        </span>
      ))}
    </div>
  </div>
);
