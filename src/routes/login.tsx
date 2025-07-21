import { OTPInput } from 'input-otp';
import React from 'react';
import { useConvexAuth } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/login')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <h1>Login</h1>
      <LoginForm />
    </div>
  );
}

export function LoginForm() {
  const { signIn } = useAuthActions();
  const [step, setStep] = React.useState<'signIn' | { email: string }>('signIn');
  return step === 'signIn' ? (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        const form = event.currentTarget as HTMLFormElement;
        event.preventDefault();
        const formData = new FormData(form);
        void signIn('otp', formData).then(() => setStep({ email: formData.get('email') as string }));
        form.reset();
      }}
    >
      <input name="email" placeholder="Email" type="email" className="rounded-md border p-1" />
      <button type="submit" className="rounded-md bg-blue-700 px-2 py-1 text-white">
        Send code
      </button>
    </form>
  ) : (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        void signIn('otp', formData);
      }}
    >
      <input name="code" placeholder="Code" type="text" className="outline-none" />

      <input name="email" value={step.email} type="hidden" />
      <button type="submit" className="rounded-md bg-blue-700 px-2 py-1 text-white">
        Continue
      </button>
      <button type="button" onClick={() => setStep('signIn')}>
        Cancel
      </button>
    </form>
  );
}
