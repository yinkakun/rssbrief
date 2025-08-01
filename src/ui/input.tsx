import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-9 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1 text-base transition-[color] outline-none selection:bg-slate-800 selection:text-slate-50 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-slate-800 placeholder:text-slate-500 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-slate-300',
        'aria-invalid:border-red-500 aria-invalid:ring-red-500/20',
        className,
      )}
      {...props}
    />
  );
}
