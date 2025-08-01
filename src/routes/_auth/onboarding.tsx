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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';

import { PiCheck, PiCheckCircle, PiPlus } from 'react-icons/pi';

const nameSchema = z.object({
  name: z.string().min(1, 'First name is required').max(100, 'First name must be 100 characters or less'),
});

const topicsSchema = z.object({
  topics: z.array(z.string()).min(3, 'Select at least 3 topics'),
});

const briefTimingSchema = z.object({
  hour: z.string().min(1, 'Please select an hour'),
  dayOfWeek: z.string().min(1, 'Please select a day'),
});

const formSchema = z.object({
  ...nameSchema.shape,
  ...topicsSchema.shape,
  ...briefTimingSchema.shape,
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
    <div className="flex min-h-[100dvh] grow flex-col items-center justify-center bg-slate-50">
      <div>
        <Stepper>
          <NameStep />
          <TopicsStep />
          <BriefTimingStep />
          <FinalStep />
        </Stepper>
      </div>
    </div>
  );
}

const POPULAR_TOPICS = [
  { id: 'technology', label: 'Technology', description: 'Latest tech news and innovations' },
  { id: 'business', label: 'Business', description: 'Market trends and business insights' },
  { id: 'science', label: 'Science', description: 'Scientific discoveries and research' },
  { id: 'health', label: 'Health', description: 'Health and wellness updates' },
  { id: 'sports', label: 'Sports', description: 'Sports news and highlights' },
  { id: 'entertainment', label: 'Entertainment', description: 'Movies, TV, and celebrity news' },
  { id: 'finance', label: 'Finance', description: 'Financial markets and investing' },
  { id: 'travel', label: 'Travel', description: 'Travel guides and destinations' },
  { id: 'food', label: 'Food', description: 'Recipes and culinary trends' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOURS = [
  '12:00 AM',
  '1:00 AM',
  '2:00 AM',
  '3:00 AM',
  '4:00 AM',
  '5:00 AM',
  '6:00 AM',
  '7:00 AM',
  '8:00 AM',
  '9:00 AM',
  '10:00 AM',
  '11:00 AM',
  '12:00 PM',
  '1:00 PM',
  '2:00 PM',
  '3:00 PM',
  '4:00 PM',
  '5:00 PM',
  '6:00 PM',
  '7:00 PM',
  '8:00 PM',
  '9:00 PM',
  '10:00 PM',
  '11:00 PM',
];

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
    <div className="relative flex w-full max-w-md flex-col items-center gap-6 rounded-3xl border border-black/5 bg-white p-8 pt-16 text-left">
      <StepperProgressBar totalSteps={totalSteps} currentStep={activeStepIndex + 1} />

      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-slate-800">What should we call you?</h2>
        <p className="text-xs text-slate-600">Your preferred name will be used to personalize your experience</p>
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

const TopicsStep = () => {
  const { formData, updateFormData } = useFormData();
  const { activeStepIndex, totalSteps, nextStep } = useStepper();

  const form = useForm<z.infer<typeof topicsSchema>>({
    resolver: zodResolver(topicsSchema),
    defaultValues: { topics: formData.topics || [] },
  });

  const selectedTopics = form.watch('topics') || [];

  const toggleTopic = (topicId: string) => {
    const current = selectedTopics;
    const updated = current.includes(topicId) ? current.filter((id) => id !== topicId) : [...current, topicId];
    form.setValue('topics', updated);
  };

  const onSubmit = (data: z.infer<typeof topicsSchema>) => {
    updateFormData(data);
    nextStep();
  };

  return (
    <div className="relative flex w-full max-w-lg flex-col items-center gap-6 rounded-3xl border border-black/5 bg-white p-8 pt-16 text-left">
      <StepperProgressBar totalSteps={totalSteps} currentStep={activeStepIndex + 1} />

      <div className="flex flex-col gap-1 text-center">
        <h2 className="text-lg font-medium text-slate-800">Choose your interests</h2>
        <p className="text-xs text-slate-600">Select 3-5 topics to get personalized briefs</p>
      </div>

      <form className="flex w-full flex-col gap-6" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="grid grid-cols-3 gap-3">
          {POPULAR_TOPICS.map((topic) => {
            const isSelected = selectedTopics.includes(topic.id);

            return (
              <button
                type="button"
                key={topic.id}
                onClick={() => toggleTopic(topic.id)}
                className={cn(
                  'flex flex-col gap-1 rounded-xl border border-slate-200 p-3 text-left transition-colors hover:bg-slate-50',
                  isSelected ? 'bg-slate-100' : 'bg-white',
                )}
              >
                <div className="flex items-center gap-2">
                  {isSelected ? (
                    <PiCheckCircle size={20} className="shrink-0 text-slate-500" />
                  ) : (
                    <PiPlus size={20} className="shrink-0 text-slate-500" />
                  )}

                  <span className="text-xs text-slate-950">{topic.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {form.formState.errors?.topics?.message && (
          <p className={cn('text-center text-xs text-red-500')}>{form.formState.errors.topics.message}</p>
        )}

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Spinner /> : 'Continue'}
        </Button>
      </form>
    </div>
  );
};

const BriefTimingStep = () => {
  const { formData, updateFormData } = useFormData();
  const { activeStepIndex, totalSteps, nextStep } = useStepper();

  const form = useForm<z.infer<typeof briefTimingSchema>>({
    resolver: zodResolver(briefTimingSchema),
    defaultValues: {
      hour: formData.hour || '',
      dayOfWeek: formData.dayOfWeek || '',
    },
  });

  const onSubmit = (data: z.infer<typeof briefTimingSchema>) => {
    console.log('Form Data:', data);
    updateFormData(data);
    nextStep();
  };

  return (
    <div className="relative flex w-full max-w-2xl flex-col items-center gap-6 rounded-3xl border border-black/5 bg-white p-8 pt-16 text-left">
      <StepperProgressBar totalSteps={totalSteps} currentStep={activeStepIndex + 1} />

      <div className="flex flex-col gap-1 text-center">
        <h2 className="text-lg font-medium text-slate-800">Configure your briefs</h2>
        <p className="text-xs text-slate-600">Choose when and how you'd like to receive your briefs</p>
      </div>

      <form className="flex w-full flex-col gap-6" onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex w-full flex-col gap-2">
          <label className="text-sm font-medium text-slate-950">Day of Week</label>
          <Controller
            name="dayOfWeek"
            control={form.control}
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-4 gap-4">
                {DAYS.map((day) => (
                  <label
                    key={day}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center hover:bg-slate-100',
                      field.value === day && 'border-slate-300 bg-slate-100',
                    )}
                  >
                    <RadioGroupItem value={day} id={`day-${day.toLowerCase()}`} />
                    <span className="text-xs">{day.slice(0, 300)}</span>
                  </label>
                ))}
              </RadioGroup>
            )}
          />
          {form.formState.errors?.dayOfWeek && (
            <p className="text-xs text-red-500">{form.formState.errors.dayOfWeek.message}</p>
          )}
        </div>

        {/* Time and Timezone */}
        <div className="grid grid-cols-1 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-950">Hour</label>
            <Controller
              name="hour"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select hour" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    <SelectGroup>
                      {HOURS.map((hour) => (
                        <SelectItem key={hour} value={hour}>
                          {hour}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors?.hour && (
              <p className="text-xs text-red-500">{form.formState.errors.hour.message}</p>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Spinner /> : 'Continue'}
        </Button>
      </form>
    </div>
  );
};

const FinalStep = () => {
  return (
    <div className="relative flex w-full max-w-md min-w-sm flex-col items-center gap-10 rounded-3xl border border-slate-300 bg-white p-6 pt-4 text-center">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-medium text-slate-800">Welcome to 🗞️ RSSBrief</h2>
        <p className="text-sm text-slate-600">You're all set up!</p>
      </div>

      <PiCheck className="h-24 w-24 text-slate-800" />

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
  const isActiveStep = (index: number) => index === currentStep - 1;

  const shouldHighlightStep = (index: number) => index < currentStep;

  return (
    <div
      style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
      className="absolute inset-x-8 top-8 grid h-1.5 gap-2 rounded-full bg-transparent"
    >
      {[...Array(totalSteps)].map((_, index) => (
        <div
          key={index}
          className={cn('h-full w-full rounded-full backdrop-blur-sm', {
            'bg-slate-100': !shouldHighlightStep(index),
            'bg-black/90': shouldHighlightStep(index),
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
