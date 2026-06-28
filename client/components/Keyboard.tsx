'use client';

import React from 'react';

const KeyButton = React.memo(({
    letter,
    pressed,
    onClick
}: {
    letter: string;
    pressed: boolean;
    onClick: () => void;
}) => (
    <button
        className={`relative w-[calc((100vw/10)-0.25em)] h-[8vh] sm:w-10 sm:h-12 md:w-14 md:h-14 lg:w-16 lg:h-16 bg-gray-500 sm:bg-zinc-800 rounded-md
      sm:shadow-[0_4px_0_#222222,0_5px_5px_rgba(0,0,0,0.7)]
      text-white text-lg font-bold cursor-pointer
      transition-all duration-100 ease-in-out
      border-t-0 border-[#222222] border-l-0 border-b-0 border-r-2
      ${pressed ? 'translate-y-1 bg-red-300 sm:bg-zinc-600 cursor-default shadow-[0_2px_2px_rgba(0,0,0,0.7)]' : 'hover:bg-zinc-700'}`}
        onClick={onClick}
        disabled={pressed}
    >
        {letter.toUpperCase()}
    </button>
));

KeyButton.displayName = "KeyButton";

export const KeyboardRow = React.memo(({
    row,
    pressedKeys,
    onClick
}: {
    row: string[];
    pressedKeys: Set<string>;
    onClick: (key: string) => void;
}) => (
    <div className='flex gap-1 m-1 sm:gap-3 md:gap-5 lg:gap-10 justify-center sm:m-10'>
        {row.map(key => (
            <KeyButton
                key={key}
                letter={key}
                pressed={pressedKeys.has(key)}
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
