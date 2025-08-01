import * as React from 'react';
import { cn } from '@/lib/utils';
import { OTPInput as OTPInputPrimitive, OTPInputContext } from 'input-otp';

type OtpInputProps = React.ComponentProps<typeof OTPInputPrimitive> & {
  containerClassName?: string;
};

export function OtpInput({ className, containerClassName, ...props }: OtpInputProps) {
  return (
    <OTPInputPrimitive
      data-slot="input-otp"
      containerClassName={cn('flex items-center gap-2 has-disabled:opacity-50', containerClassName)}
      className={cn('disabled:cursor-not-allowed', className)}
      {...props}
    />
  );
}

interface OtpInputSlotProps extends React.ComponentProps<'div'> {
  index: number;
}

export function OtpInputSlot({ index, className, ...props }: OtpInputSlotProps) {
  const inputOTPContext = React.useContext(OTPInputContext);
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center border-y border-r border-slate-300 text-sm transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md aria-invalid:border-red-500 data-[active=true]:z-10 data-[active=true]:bg-slate-100 data-[active=true]:aria-invalid:border-red-500',
        className,
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="animate-caret-blink h-4 w-px bg-slate-800 duration-1000" />
        </div>
      )}
    </div>
  );
}

export function OtpInputGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="input-otp-group" className={cn('flex items-center', className)} {...props} />;
}
