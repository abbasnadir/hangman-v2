'use client';
import Image from 'next/image';
import Card from './Card';

interface GameHeaderProps {
  lives: number;
  totalLives: number;
  time: string;
  onGiveUp: () => void;
}

export const GameHeader = ({
  lives,
  totalLives,
  time,
  onGiveUp
}: GameHeaderProps) => (
  <div className="flex w-full justify-between items-center p-2 sm:p-8 pt-0">
    <div className="flex h-min">
      {[...Array(Math.max(0, lives))].map((_, i) => (
        <Image 
          src="/heart.png" 
          width={30} 
          height={30} 
          alt="heart" 
          key={`heart-${i}`} 
          className="mr-1"
        />
      ))}
      {[...Array(Math.max(0, totalLives - lives))].map((_, i) => (
        <Image 
          src="/broken_heart.png" 
          width={30} 
          height={30} 
          alt="broken heart" 
          key={`broken-${i}`}
          className="mr-1"
        />
      ))}
    </div>

    <div className="text-xl font-bold">{time}</div>

    <Card onClick={onGiveUp} className="w-min whitespace-nowrap bg-red-600/80 text-white hover:bg-red-700/80">
      Give Up
    </Card>
  </div>
);
