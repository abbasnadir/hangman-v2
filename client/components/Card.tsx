import React from 'react';

type CardProps = {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
};

export default function Card({ children, onClick, className = '' }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`select-none rounded-tr-2xl rounded-bl-2xl cursor-pointer p-1 sm:p-3 m-3 sm:m-6 min-h-5 sm:min-h-10 min-w-20 text-center shadow-[0_0_10px_rgba(0,0,0,0.3)] hover:shadow-[0_0_15px_rgba(0,0,0,0.5)] hover:translate-x-1 hover:-translate-y-1 transition-transform ${className}`}
    >
      {children}
    </div>
  );
}
