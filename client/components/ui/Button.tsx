import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'emerald';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    
    const baseStyles = "inline-flex items-center justify-center font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
    
    const variants = {
      primary: "bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow-[0_0_15px_rgba(124,58,237,0.3)] uppercase tracking-wider",
      emerald: "bg-emerald-500 hover:bg-emerald-400 text-emerald-950 rounded-xl uppercase tracking-wider shadow-[0_0_15px_rgba(16,185,129,0.3)]",
      secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/10 rounded-full",
      danger: "bg-rose-900/40 hover:bg-rose-800/60 text-rose-300 border border-rose-500/20 rounded-full",
      ghost: "text-zinc-400 hover:text-violet-400 bg-transparent hover:bg-white/5 rounded-lg",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-6 py-3 text-base gap-2",
      lg: "px-8 py-4 text-lg gap-3",
      icon: "p-2",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? (
          <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
