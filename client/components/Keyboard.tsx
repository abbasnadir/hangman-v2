'use client';

import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const KeyButton = React.memo(({
    letter,
    isCorrect,
    isWrong,
    onClick
}: {
    letter: string;
    isCorrect: boolean;
    isWrong: boolean;
    onClick: () => void;
}) => {
    const isPressed = isCorrect || isWrong;

    return (
        <button
            className={cn(
                "relative w-[calc((100vw/10)-0.25rem)] h-[8vh] sm:w-10 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-xl",
                "text-white text-lg sm:text-xl font-black cursor-pointer uppercase",
                "transition-all duration-100 ease-in-out border-b-4",
                !isPressed && "bg-[#251A3D] border-[#1e1531] hover:bg-[#342555] hover:border-[#2a1e45] hover:-translate-y-0.5 active:translate-y-1 active:border-b-0",
                isCorrect && "bg-emerald-500 border-emerald-700 translate-y-1 border-b-0 cursor-default shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]",
                isWrong && "bg-rose-500 border-rose-700 translate-y-1 border-b-0 cursor-default opacity-50 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)]"
            )}
            onClick={onClick}
            disabled={isPressed}
        >
            {letter}
        </button>
    );
});

KeyButton.displayName = "KeyButton";

export const KeyboardRow = React.memo(({
    row,
    correctKeys,
    wrongKeys,
    onClick
}: {
    row: string[];
    correctKeys: Set<string>;
    wrongKeys: Set<string>;
    onClick: (key: string) => void;
}) => (
    <div className='flex gap-1 m-1 sm:gap-2 md:gap-3 lg:gap-4 justify-center sm:m-3'>
        {row.map(key => (
            <KeyButton
                key={key}
                letter={key}
                isCorrect={correctKeys.has(key)}
                isWrong={wrongKeys.has(key)}
                onClick={() => onClick(key)}
            />
        ))}
    </div>
));

KeyboardRow.displayName = "KeyboardRow";

export const keyboardLayout = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
];
