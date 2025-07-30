import { z } from 'zod/v4';
import { cn } from '@/lib/utils';
import { atom, useAtom } from 'jotai';
import { zodResolver } from '@hookform/resolvers/zod';
import { createFileRoute } from '@tanstack/react-router';

import { motion } from 'motion/react';
import { Link } from '@tanstack/react-router';
import { useForm, Controller } from 'react-hook-form';

import { Input } from '@/ui/input';
import { Button } from '@/ui/button';
import { Spinner } from '@/ui/spinner';
import { Stepper, useStepper } from '@/ui/stepper';
import { RadioGroup, RadioGroupItem } from '@/ui/radio';

import { PiCircle, PiRadioButton, PiCheck } from 'react-icons/pi';

const nameSchema = z.object({
  name: z.string().min(1, 'First name is required').max(100, 'First name must be 100 characters or less'),
});

const formSchema = z.object({
  ...nameSchema.shape,
});

type FormSchemaType = z.infer<typeof formSchema>;

const formDataAtom = atom<Partial<FormSchemaType>>({});

const useFormData = () => {
  const [formData, setFormData] = useAtom(formDataAtom);
  const updateFormData = (newData: Partial<FormSchemaType>) => {
    setFormData((prev) => ({ ...prev, ...newData }));
    return { ...formData, ...newData };
  };

  return { formData, updateFormData };
};

export const Route = createFileRoute('/_auth/onboarding')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex min-h-[100dvh] grow flex-col items-center justify-center bg-neutral-50">
      <div>
        <Stepper>
          <NameStep />
          <FinalStep />
        </Stepper>
      </div>
    </div>
  );
}

const NameStep = () => {
  const { formData, updateFormData } = useFormData();
  const { activeStepIndex, totalSteps, nextStep } = useStepper();

  const form = useForm<z.infer<typeof nameSchema>>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: formData.name || '' },
  });

  const onSubmit = (data: z.infer<typeof nameSchema>) => {
    updateFormData(data);
    nextStep();
  };

  return (
    <div className="relative flex w-sm max-w-md flex-col items-center gap-6 rounded-3xl border border-neutral-300 bg-white p-8 pt-16 text-left">
      <StepperProgressBar totalSteps={totalSteps} currentStep={activeStepIndex + 1} />

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-neutral-800">What should we call you?</h2>
        <p className="text-xs text-neutral-600">Your preferred name will be used to personalize your experience</p>
      </div>

      <form className="flex w-full flex-col gap-10" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex w-full flex-col gap-0.5">
          <Input {...form.register('name')} className="w-full" placeholder="Your preferred Name" />

          {form.formState.errors?.name?.message && (
            <p className={cn('pl-3 text-xs text-red-500')}>{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="flex gap-4">
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Spinner /> : 'Next'}
          </Button>
        </div>
      </form>
    </div>
  );
};

const FinalStep = () => {
  return (
    <div className="relative flex w-full max-w-md min-w-sm flex-col items-center gap-10 rounded-3xl border border-neutral-300 bg-white p-6 pt-4 text-center">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-neutral-800">Welcome to 🗞️ RSSBrief</h2>
        <p className="text-sm text-neutral-600">You're all set up!</p>
      </div>

      <PiCheck className="h-24 w-24 text-neutral-800" />

      <div className="flex w-full flex-col gap-4">
        <Button asChild>
          <Link to="/feeds">Go to Feeds</Link>
        </Button>
      </div>
    </div>
  );
};

interface StepProgressBarProps {
  totalSteps: number;
  currentStep: number;
}

const StepperProgressBar = ({ totalSteps, currentStep }: StepProgressBarProps) => {
  const isPrevStep = (index: number) => index < currentStep - 1;
  const isActiveStep = (index: number) => index === currentStep - 1;

  return (
    <div
      style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
      className="absolute inset-x-8 top-8 grid h-1.5 gap-2 rounded-full bg-transparent"
    >
      {[...Array(totalSteps)].map((_, index) => (
        <div
          key={index}
          className={cn('h-full w-full rounded-full backdrop-blur-sm', {
            'bg-neutral-100': !isPrevStep(index),
            'bg-neutral-500': isPrevStep(index),
          })}
        >
          {isActiveStep(index) && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.2 }}
              className="bg-primary h-full w-full rounded-full"
            />
          )}
        </div>
      ))}
    </div>
  );
};
