import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useForm, Controller, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { useMutation } from '@tanstack/react-query';
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';
import timezones from 'timezones-list';

import { Input } from '@/ui/input';
import { Switch } from '@/ui/switch';
import { Button } from '@/ui/button';
import { Spinner } from '@/ui/spinner';
import { RadioGroup, RadioGroupItem } from '@/ui/radio';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';
import { toast } from '@/ui/toaster';

import { api } from 'convex/_generated/api';

import { HOURS, DAYS } from '@/lib/constants';

const accountFormSchema = z.object({
  name: z.string().min(1, 'First name is required').max(100, 'First name must be 100 characters or less'),
});

const briefsFormSchema = z.object({
  hour: z.number().min(0, 'Hour is required'),
  dayOfWeek: z.number().min(0, 'Day of week is required'),
  timezone: z.string().min(1, 'Preferred timezone is required'),
  style: z.enum(['concise', 'detailed'] as const),
  emailNotifications: z.boolean(),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;
type BriefsFormValues = z.infer<typeof briefsFormSchema>;

const SUMMARY_STYLES = [
  { label: 'Concise', value: 'concise' as const, description: 'Straight to the point 1-2 summary of the entry' },
  { label: 'Detailed', value: 'detailed' as const, description: 'A more detailed summary with key points' },
];

interface UserPreferences {
  name?: string;
  briefSchedule?: {
    hour?: number;
    dayOfWeek?: number;
    timezone?: string;
  };
  briefStyle?: 'concise' | 'detailed';
  notifications?: {
    email?: boolean;
  };
}

interface AccountSettingsProps {
  userPreferences?: UserPreferences;
}

interface BriefsSettingsProps {
  userPreferences?: UserPreferences;
}

interface SettingsFormProps {
  title: string;
  children: React.ReactNode;
  onSubmit: () => void;
  isLoading: boolean;
}

interface DaySelectionProps {
  form: UseFormReturn<BriefsFormValues>;
}

interface TimeSettingsProps {
  form: UseFormReturn<BriefsFormValues>;
}

interface StyleSelectionProps {
  form: UseFormReturn<BriefsFormValues>;
}

interface NotificationSettingsProps {
  form: UseFormReturn<BriefsFormValues>;
}

export const Route = createFileRoute('/_auth/_app/settings')({
  component: SettingsPage,
});

function SettingsPage() {
  const userPreferencesQuery = useConvexQuery(api.users.getCurrentUser, {});
  const userPreferences = userPreferencesQuery?.preferences;

  return (
    <div className="flex h-full flex-col gap-4">
      <h1 className="text-2xl text-slate-950">Settings</h1>
      <div className="flex h-full">
        <div className="flex w-full max-w-4xl flex-col gap-6">
          <AccountSettings userPreferences={userPreferences} />
          <BriefsSettings userPreferences={userPreferences} />
        </div>
      </div>
    </div>
  );
}

function SettingsForm({ title, children, onSubmit, isLoading }: SettingsFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-8 rounded-2xl border border-black/5 bg-white">
      <div className="px-4 pt-2">
        <h2 className="text-lg text-slate-950">{title}</h2>
      </div>
      {children}
      <div className="flex w-full items-center justify-end border-t border-slate-100 p-4">
        <Button type="submit" variant="outline" className="ml-auto w-full max-w-[100px]" disabled={isLoading}>
          {isLoading ? <Spinner color="black" /> : 'Save'}
        </Button>
      </div>
    </form>
  );
}

function AccountSettings({ userPreferences }: AccountSettingsProps) {
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: userPreferences?.name || '',
    },
  });

  const accountMutation = useMutation({
    mutationFn: useConvexMutation(api.users.updateUserPreferences),
    onSuccess: () => {
      toast({ title: 'Account settings updated successfully!' });
    },
    onError: () => {
      toast({ title: 'Error updating account settings' });
    },
  });

  const handleSubmit = (data: AccountFormValues) => {
    accountMutation.mutate({
      name: data.name,
    });
  };

  useEffect(() => {
    if (userPreferences?.name) {
      form.setValue('name', userPreferences.name);
    }
  }, [userPreferences?.name, form]);

  return (
    <SettingsForm title="Account" onSubmit={form.handleSubmit(handleSubmit)} isLoading={accountMutation.isPending}>
      <AccountNameField form={form} defaultValue={userPreferences?.name} />
    </SettingsForm>
  );
}

function AccountNameField({ form, defaultValue }: { form: UseFormReturn<AccountFormValues>; defaultValue?: string }) {
  const {
    formState: { errors },
  } = form;

  return (
    <div className="flex flex-col gap-2 px-4">
      <label htmlFor="name" className="text-sm font-medium text-slate-950">
        Display Name
      </label>
      <Input defaultValue={defaultValue} formNoValidate {...form.register('name')} />
      {errors.name && <span className="text-xs text-red-500">{errors.name.message}</span>}
    </div>
  );
}

function BriefsSettings({ userPreferences }: BriefsSettingsProps) {
  const getDefaultValues = (): BriefsFormValues => ({
    hour: userPreferences?.briefSchedule?.hour ?? 9,
    dayOfWeek: userPreferences?.briefSchedule?.dayOfWeek ?? 1,
    timezone: userPreferences?.briefSchedule?.timezone || timezones[0]?.tzCode || 'UTC',
    style: userPreferences?.briefStyle ?? 'concise',
    emailNotifications: userPreferences?.notifications?.email ?? true,
  });

  const form = useForm<BriefsFormValues>({
    resolver: zodResolver(briefsFormSchema),
    defaultValues: getDefaultValues(),
  });

  const updatePreferencesMutation = useMutation({
    mutationFn: useConvexMutation(api.users.updateUserPreferences),
    onSuccess: () => {
      toast({ title: 'Briefs settings updated successfully!' });
    },
    onError: () => {
      toast({ title: 'Error updating briefs settings' });
    },
  });

  useEffect(() => {
    if (userPreferences?.briefSchedule) {
      const scheduleData = getDefaultValues();

      Object.entries(scheduleData).forEach(([key, value]) => {
        form.setValue(key as keyof BriefsFormValues, value);
      });
    }
  }, [userPreferences, form]);

  const handleSubmit = (data: BriefsFormValues) => {
    updatePreferencesMutation.mutate({
      brief: {
        schedule: {
          hour: data.hour,
          timezone: data.timezone,
          dayOfWeek: data.dayOfWeek,
        },
        style: data.style,
      },
      notifications: {
        email: data.emailNotifications,
      },
    });
  };

  return (
    <SettingsForm
      title="Briefs"
      onSubmit={form.handleSubmit(handleSubmit)}
      isLoading={updatePreferencesMutation.isPending}
    >
      <DaySelection form={form} />
      <TimeSettings form={form} />
      <StyleSelection form={form} />
      <NotificationSettings form={form} />
    </SettingsForm>
  );
}

function DaySelection({ form }: DaySelectionProps) {
  return (
    <div className="flex flex-col gap-2 px-4">
      <label htmlFor="day" className="text-sm font-medium text-slate-950">
        Day of Week
      </label>
      <div className="flex items-center gap-4">
        <Controller
          name="dayOfWeek"
          control={form.control}
          render={({ field }) => (
            <RadioGroup
              value={field.value?.toString()}
              onValueChange={(value) => field.onChange(Number(value))}
              className="flex w-full items-center justify-around"
            >
              {DAYS.map((day) => (
                <DayRadioOption key={day.value} day={day} />
              ))}
            </RadioGroup>
          )}
        />
      </div>
    </div>
  );
}

function DayRadioOption({ day }: { day: { value: number; label: string } }) {
  return (
    <label className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center hover:bg-slate-100">
      <RadioGroupItem value={day.value.toString()} id={`day-${day.value}`} />
      <span className="text-xs">{day.label}</span>
    </label>
  );
}

function TimeSettings({ form }: TimeSettingsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 px-4">
      <HourSelection form={form} />
      <TimezoneSelection form={form} />
    </div>
  );
}

function HourSelection({ form }: { form: UseFormReturn<BriefsFormValues> }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-950">Hour</label>
      <Controller
        name="hour"
        control={form.control}
        render={({ field }) => (
          <Select
            onValueChange={(value) => field.onChange(Number(value))}
            value={field.value?.toString() || ''}
            key={`hour-${field.value}`}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select hour" />
            </SelectTrigger>
            <SelectContent className="max-h-[250px]">
              <SelectGroup>
                {HOURS.map(({ label, value }) => (
                  <SelectItem key={value} value={value.toString()}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}

function TimezoneSelection({ form }: { form: UseFormReturn<BriefsFormValues> }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="preferred-timezone" className="text-sm font-medium text-slate-950">
        Time Zone
      </label>
      <Controller
        name="timezone"
        control={form.control}
        render={({ field }) => (
          <Select value={field.value || ''} onValueChange={field.onChange} key={`timezone-${field.value}`}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a time zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {timezones.map((tz) => (
                  <SelectItem key={tz.tzCode} value={tz.tzCode}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      />
    </div>
  );
}

function StyleSelection({ form }: StyleSelectionProps) {
  return (
    <div className="px-4">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-950">Style</label>
        <Controller
          name="style"
          control={form.control}
          render={({ field }) => (
            <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-2 gap-3">
              {SUMMARY_STYLES.map((style) => (
                <StyleRadioOption key={style.value} style={style} />
              ))}
            </RadioGroup>
          )}
        />
      </div>
    </div>
  );
}

function StyleRadioOption({ style }: { style: (typeof SUMMARY_STYLES)[0] }) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100">
      <div className="flex items-center gap-3">
        <RadioGroupItem value={style.value} id={`style-${style.value}`} />
        <div className="flex flex-col">
          <span className="text-sm text-slate-950">{style.label}</span>
          <span className="text-xs text-slate-600">{style.description}</span>
        </div>
      </div>
    </label>
  );
}

function NotificationSettings({ form }: NotificationSettingsProps) {
  return (
    <div className="px-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-950">Email Notifications</label>
        </div>
        <Controller
          name="emailNotifications"
          control={form.control}
          render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />}
        />
      </div>
    </div>
  );
}
