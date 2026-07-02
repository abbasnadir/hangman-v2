import React from 'react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type CardProps = {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  delay?: number;
};

export default function Card({ children, onClick, className, delay = 0 }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, type: "spring", bounce: 0.4 }}
      onClick={onClick}
      className={cn(
        "relative rounded-3xl bg-[#251A3D] p-6 shadow-xl border-t border-white/10",
        onClick && "cursor-pointer hover:bg-[#2d204a] active:scale-[0.98] transition-colors",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
