import React from 'react';
import { cn } from './Button';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full bg-[#171124] text-white border border-white/10 rounded-xl p-3 outline-none focus:border-violet-500 transition-colors shadow-inner text-sm disabled:opacity-50 min-h-[80px]",
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';
