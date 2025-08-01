import * as React from 'react';
import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all disabled:pointer-events-none disabled:bg-slate-900/90 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-slate-50 focus-visible:ring-slate-400/50 focus-visible:ring-[3px] aria-invalid:ring-red-500/20 aria-invalid:border-red-500",
  {
    variants: {
      variant: {
        ghost: 'hover:bg-slate-50 hover:text-slate-700',
        link: 'text-slate-800 underline-offset-4 hover:underline',
        default: 'bg-black text-slate-50 hover:text-slate-200',
        secondary: 'bg-slate-100 text-slate-800 hover:bg-slate-100/80',
        destructive: 'bg-red-600 text-white hover:bg-red-600/90',
        outline: 'border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-800',
      },
      size: {
        icon: 'size-9',
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        lg: 'h-10 rounded-xl px-6 has-[>svg]:px-4',
        sm: 'h-8 rounded-xl gap-1.5 px-3 has-[>svg]:px-2.5',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
  },
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
