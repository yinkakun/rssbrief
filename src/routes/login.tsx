import React from 'react';
import { z } from 'zod/v4';
import { useMutation } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import { atom, useSetAtom, useAtomValue } from 'jotai';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { useAuthActions } from '@convex-dev/auth/react';

import { Input } from '@/ui/input';
import { Button } from '@/ui/button';
import { Spinner } from '@/ui/spinner';
import { Stepper, useStepper } from '@/ui/stepper';
import { OtpInput, OtpInputSlot, OtpInputGroup } from '@/ui/otp-input';

const emailAtom = atom('');

const otpSchema = z.object({
  code: z.string().min(1, 'Please enter the verification code'),
});

const emailSchema = z.object({
  email: z.email('Please enter a valid email address'),
});

type OtpForm = z.infer<typeof otpSchema>;
type EmailForm = z.infer<typeof emailSchema>;

export const Route = createFileRoute('/login')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-neutral-50">
      <div>
        <Stepper>
          <EmailForm />
          <VerifyCode />
        </Stepper>
      </div>
    </div>
  );
}

const EmailForm = () => {
  const { signIn } = useAuthActions();
  const { nextStep } = useStepper();
  const setEmail = useSetAtom(emailAtom);

  const form = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      email: '',
    },
  });

  const requestCodeMutation = useMutation({
    mutationFn: async (data: EmailForm) => {
      const formData = new FormData();
      formData.append('email', data.email);
      return signIn('otp', formData);
    },
    onSuccess: () => {
      form.reset();
    },
    onError: (error) => {
      console.error('Failed to send code:', error);
      //  todo: add toast notifications
    },
  });

  const onSubmit = (data: EmailForm) => {
    if (requestCodeMutation.isPending) return;
    requestCodeMutation.mutate(data, {
      onSuccess: () => {
        setEmail(data.email);
        nextStep();
      },
    });
  };

  return (
    <LoginStepWrapper>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex w-full flex-col gap-4">
        <div className="w-full">
          <Input type="email" formNoValidate {...form.register('email')} className="w-full" placeholder="Enter email" />
          {form.formState.errors.email && (
            <span className="text-xs text-red-500">{form.formState.errors.email.message}</span>
          )}
        </div>

        <Button type="submit" className="w-full" formNoValidate disabled={requestCodeMutation.isPending}>
          {requestCodeMutation.isPending ? <Spinner /> : 'Send OTP'}
        </Button>
      </form>
    </LoginStepWrapper>
  );
};

const VerifyCode = () => {
  const navigate = useNavigate();
  const { signIn } = useAuthActions();
  const email = useAtomValue(emailAtom);

  const form = useForm<OtpForm>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      code: '',
    },
  });

  const verifyCodeMutation = useMutation({
    mutationFn: async ({ code }: OtpForm) => {
      const formData = new FormData();
      formData.append('email', email);
      formData.append('code', code);
      return signIn('otp', formData);
    },
    onError: (error) => {
      console.error('Failed to verify code:', error);
      // todo: add toast notification
    },
  });

  const onSubmit = (data: OtpForm) => {
    verifyCodeMutation.mutate(data, {
      onSuccess: () => {
        // todo use convex query to check if user is onboarded
        const onboarded = true;
        if (onboarded) {
          navigate({
            to: '/feeds',
          });
        } else {
          navigate({
            to: '/onboarding',
          });
        }
      },
    });
  };

  return (
    <LoginStepWrapper>
      <form onSubmit={form.handleSubmit(onSubmit)} className="w-full">
        <div className="flex w-full flex-col items-center gap-4">
          <span className="text-xs text-neutral-600">Enter the 6-digit code sent to {email}</span>
          <Controller
            name="code"
            control={form.control}
            render={({ field }) => (
              <OtpInput maxLength={6} {...field}>
                <OtpInputGroup>
                  <OtpInputSlot index={0} />
                  <OtpInputSlot index={1} />
                  <OtpInputSlot index={2} />
                  <OtpInputSlot index={3} />
                  <OtpInputSlot index={4} />
                  <OtpInputSlot index={5} />
                </OtpInputGroup>
              </OtpInput>
            )}
          />

          {form.formState.errors.code && (
            <span className="text-xs text-red-500">{form.formState.errors.code.message}</span>
          )}

          <Button type="submit" className="w-full" formNoValidate disabled={verifyCodeMutation.isPending}>
            {verifyCodeMutation.isPending ? <Spinner /> : 'Verify OTP'}
          </Button>
        </div>
      </form>
    </LoginStepWrapper>
  );
};

interface LoginStepWrapperProps {
  children: React.ReactNode;
}

const LoginStepWrapper = ({ children }: LoginStepWrapperProps) => {
  return (
    <div className="flex max-w-sm min-w-sm flex-col items-center gap-4 rounded-3xl border border-neutral-300 bg-white p-8 text-center">
      <p className="max-w-[70%] text-center text-neutral-700">🗞️ RSSBrief</p>

      {children}

      <span className="max-w-[90%] text-xs text-neutral-600">Powered by Convex and Resend</span>
    </div>
  );
};
