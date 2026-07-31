import React from 'react';
import { cn } from './Button';

export type BadgeVariant = 'success' | 'danger' | 'neutral' | 'primary';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'neutral', children, ...props }, ref) => {
    const baseStyles = "text-[10px] uppercase font-bold px-2 py-1 rounded-full flex items-center gap-1 w-fit tracking-widest";
    
    const variants = {
      success: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20",
      danger: "bg-rose-500/20 text-rose-400 border border-rose-500/20",
      neutral: "bg-zinc-500/20 text-zinc-400 border border-white/5",
      primary: "bg-violet-500/20 text-violet-400 border border-violet-500/20",
    };

    return (
      <span
        ref={ref}
        className={cn(baseStyles, variants[variant], className)}
        {...props}
      >
        {children}
      </span>
    );
  }
);
Badge.displayName = 'Badge';
