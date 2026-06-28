'use client';

import { useEffect } from 'react';
import Card from './Card';

type GameResult = 'won' | 'lost' | 'completed' | 'abandoned';

interface GameStatusProps {
  result: GameResult;
  word: string;
  time: string;
  onMenu: () => void;
  nextRound?: boolean;
}

export const GameStatus = ({
  result,
  word,
  time,
  onMenu,
  nextRound = false
}: GameStatusProps) => {

  const getBackgroundColor = () => {
    switch (result) {
      case 'won':
      case 'completed':
        return 'bg-green-600';
      case 'lost':
        return 'bg-red-600';
      case 'abandoned':
        return 'bg-[#443939]';
      default:
        return 'bg-gray-800';
    }
  };

  const getResultMessage = () => {
    switch (result) {
      case 'won':
        return '🎉 You Win!';
      case 'completed':
        return '👏 You completed the word (Second place or later)';
      case 'lost':
        return '💀 You Lost!';
      case 'abandoned':
        return 'You Surrendered or Game Abandoned';
      default:
        return 'Game Over';
    }
  };

  useEffect(() => {
    if (nextRound) return; // Disable shortcut if transitioning to next round
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault();
        onMenu();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onMenu, nextRound]);

  return (
    <div className={`flex flex-col items-center justify-center w-full min-h-dvh text-white ${getBackgroundColor()} transition-colors duration-500`}>
      <div className="max-w-md w-full px-4 text-center">
        <h1 className="text-2xl sm:text-4xl font-bold mb-4">
          The word was: {word}
        </h1>
        
        <h2 className="text-4xl font-bold mb-6">
          {getResultMessage()}
        </h2>

        {result === 'abandoned' && (
          <p className="text-xl mb-6 italic">You didn&rsquo;t even try :(</p>
        )}

        <div className="bg-black/20 rounded-lg p-4 mb-8">
          <p className="text-2xl">Time: {time}</p>
        </div>

        <div className="flex flex-col sm:flex-row justify-center gap-4">
          {nextRound ? (
            <div className="bg-black/40 text-white text-lg sm:text-xl px-8 py-3 rounded-lg animate-pulse">
              Next Round Starting...
            </div>
          ) : (
            <Card 
              onClick={onMenu}
              className="bg-black/40 text-white text-lg sm:text-xl px-8 py-3 hover:scale-105 transition-transform cursor-pointer"
            >
              Main Menu
            </Card>
          )}
        </div>
        {!nextRound && (
          <p className="mt-6 text-sm opacity-70">
            Press ENTER to return to menu
          </p>
        )}
      </div>
    </div>
  );
};

GameStatus.displayName = "GameStatus";
