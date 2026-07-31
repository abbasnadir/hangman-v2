import React from 'react';
import { WordDisplay } from '@/components/WordDisplay';
import { GameHeader } from '@/components/GameControls';
import { KeyboardRow, keyboardLayout } from '@/components/Keyboard';

interface PlayingScreenProps {
    disconnectNotification?: string | null;
    lives: number;
    totalLivesState: number;
    displayTime: string;
    onGiveUp: () => void;
    maskedWord: string[];
    correctKeys: Set<string>;
    wrongKeys: Set<string>;
    onKeyPress: (key: string) => void;
    children?: React.ReactNode; // For rendering overlays like Leaderboard
}

export const PlayingScreen: React.FC<PlayingScreenProps> = ({
    disconnectNotification,
    lives,
    totalLivesState,
    displayTime,
    onGiveUp,
    maskedWord,
    correctKeys,
    wrongKeys,
    onKeyPress,
    children,
}) => {
    return (
        <div className="select-none bg-[#171124] flex flex-col items-center justify-between w-full min-h-dvh py-2 overflow-hidden relative">
            {disconnectNotification && (
                <div className="absolute top-0 left-0 right-0 z-50 bg-rose-600/90 text-white text-center py-2 font-semibold text-sm animate-in slide-in-from-top">
                    {disconnectNotification}
                </div>
            )}

            <GameHeader
                lives={lives}
                totalLives={totalLivesState}
                time={displayTime}
                onGiveUp={onGiveUp}
            />

            <WordDisplay 
                wordArr={maskedWord} 
                wordCount={maskedWord.join("").split(" ")} 
            />

            <div className="mb-4 overflow-x-auto sm:m-0 w-full px-2">
                {keyboardLayout.map((row, rowIndex) => (
                    <KeyboardRow
                        key={rowIndex}
                        row={row}
                        correctKeys={correctKeys}
                        wrongKeys={wrongKeys}
                        onClick={onKeyPress}
                    />
                ))}
            </div>

            {children}
        </div>
    );
};
