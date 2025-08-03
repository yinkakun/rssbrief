import { createFileRoute } from '@tanstack/react-router';

import { Input } from '@/ui/input';
import { Switch } from '@/ui/switch';
import { Button } from '@/ui/button';
import { Spinner } from '@/ui/spinner';
import { RadioGroup, RadioGroupItem } from '@/ui/radio';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';

import { api } from 'convex/_generated/api';
import { useMutation } from '@tanstack/react-query';
import { useConvexMutation, useConvexQuery } from '@convex-dev/react-query';

import timezones from 'timezones-list';

import { z } from 'zod/v4';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller } from 'react-hook-form';
import { useEffect } from 'react';

import { toast } from '@/ui/toaster';

import { HOURS, DAYS } from '@/lib/constants';

export const Route = createFileRoute('/_auth/_app/settings')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-full flex-col gap-4">
      <h1 className="text-2xl text-slate-950">Settings</h1>

      <div className="flex h-full">
        <div className="flex w-full max-w-4xl flex-col gap-6">
          <AccountSettings />
          <BriefsSettings />
        </div>
      </div>
    </div>
  );
}

const accountFormSchema = z.object({
  name: z.string().min(1, 'First name is required').max(100, 'First name must be 100 characters or less'),
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

const SUMMARY_STYLES = [
  { label: 'Concise', value: 'concise', description: 'Straight to the point 1-2 summary of the entry' },
  { label: 'Detailed', value: 'detailed', description: 'A more detailed summary with key points' },
] as const;

const AccountSettings = () => {
  const userPreferencesQuery = useConvexQuery(api.users.getCurrentUser, {});

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
  });

  const accountMutation = useMutation({
    mutationFn: useConvexMutation(api.users.updateUserPreferences),
    onSuccess: () => {
      toast({ title: 'Account settings updated successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error updating account settings', description: error.message });
    },
  });

  const onSubmit = (data: AccountFormValues) => {
    console.log('Submitting account settings:', data);
    accountMutation.mutate({
      name: data.name,
    });
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex w-full flex-col gap-8 rounded-2xl border border-black/5 bg-white"
    >
      <div className="px-4 pt-2">
        <h2 className="text-lg text-slate-950">Account</h2>
      </div>

      <div className="flex flex-col gap-2 px-4">
        <label htmlFor="name" className="text-sm font-medium text-slate-950">
          Display Name
        </label>
        <Input defaultValue={userPreferencesQuery?.preferences.name} formNoValidate {...form.register('name')} />
      </div>

      <div className="flex w-full items-center justify-end border-t border-slate-100 p-4">
        <Button
          type="submit"
          variant="outline"
          className="ml-auto w-full max-w-[100px]"
          disabled={accountMutation.isPending}
        >
          {accountMutation.isPending ? <Spinner color="black" /> : 'Save'}
        </Button>
      </div>
    </form>
  );
};

const briefsFormSchema = z.object({
  hour: z.number().min(0, 'Hour is required'),
  dayOfWeek: z.number().min(0, 'Day of week is required'),
  timezone: z.string().min(1, 'Preferred timezone is required'),
  style: z.enum(SUMMARY_STYLES.map((style) => style.value)),
  emailNotifications: z.boolean(),
});

const BriefsSettings = () => {
  const userPreferencesQuery = useConvexQuery(api.users.getCurrentUser, {});
  const userPreferences = userPreferencesQuery?.preferences;

  const getDefaultValues = () => ({
    hour: userPreferences?.briefSchedule?.hour ?? 9,
    dayOfWeek: userPreferences?.briefSchedule?.dayOfWeek ?? 1,
    timezone: userPreferences?.briefSchedule?.timezone || timezones[0]?.tzCode || 'UTC',
    style: userPreferences?.briefStyle ?? 'concise',
    emailNotifications: userPreferences?.notifications?.email ?? true,
  });

  const form = useForm({
    resolver: zodResolver(briefsFormSchema),
    defaultValues: getDefaultValues(),
  });

  useEffect(() => {
    if (userPreferences?.briefSchedule) {
      const scheduleData = {
        hour: userPreferences.briefSchedule.hour ?? 9,
        dayOfWeek: userPreferences.briefSchedule.dayOfWeek ?? 1,
        timezone: userPreferences.briefSchedule.timezone || timezones[0]?.tzCode || 'UTC',
        style: userPreferences.briefStyle ?? 'concise',
        emailNotifications: userPreferences.notifications?.email ?? true,
      };

      form.setValue('hour', scheduleData.hour);
      form.setValue('style', scheduleData.style);
      form.setValue('timezone', scheduleData.timezone);
      form.setValue('dayOfWeek', scheduleData.dayOfWeek);
      form.setValue('emailNotifications', scheduleData.emailNotifications);
    }
  }, [userPreferences, form]);

  const updatePreferencesMutation = useMutation({
    mutationFn: useConvexMutation(api.users.updateUserPreferences),
    onSuccess: () => {
      toast({ title: 'Briefs settings updated successfully!' });
    },
    onError: (error) => {
      toast({ title: 'Error updating briefs settings', description: error.message });
    },
  });

  const onSubmit = (data: z.infer<typeof briefsFormSchema>) => {
    console.log('Submitting briefs settings:', data);
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
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex w-full flex-col gap-8 rounded-2xl border border-black/5 bg-white"
    >
      <div className="px-4 py-2">
        <h2 className="text-lg">Briefs</h2>
      </div>

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
                  <label
                    key={day.value}
                    className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center hover:bg-slate-100"
                  >
                    <RadioGroupItem value={day.value.toString()} id={`day-${day.value}`} />
                    <span className="text-xs">{day.label}</span>
                  </label>
                ))}
              </RadioGroup>
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 px-4">
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
      </div>

      <div className="px-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-950">Style</label>
          <Controller
            name="style"
            control={form.control}
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={field.onChange} className="grid grid-cols-2 gap-3">
                {SUMMARY_STYLES.map((style) => (
                  <label
                    key={style.value}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      <RadioGroupItem value={style.value} id={`style-${style.value}`} />
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-950">{style.label}</span>
                        <span className="text-xs text-slate-600">{style.description}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            )}
          />
        </div>
      </div>

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

      <div className="flex w-full items-center justify-end border-t border-slate-100 p-4">
        <Button
          type="submit"
          variant="outline"
          className="w-full max-w-[100px]"
          disabled={updatePreferencesMutation.isPending}
        >
          {updatePreferencesMutation.isPending ? <Spinner color="black" /> : 'Save'}
        </Button>
      </div>
    </form>
  );
};
