import { createFileRoute } from '@tanstack/react-router';

import { Input } from '@/ui/input';
import { Switch } from '@/ui/switch';
import { Button } from '@/ui/button';
import { RadioGroup, RadioGroupItem } from '@/ui/radio';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/ui/select';

import { api } from 'convex/_generated/api';
import { useMutation } from '@tanstack/react-query';
import { useConvexMutation } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';

import { toast } from '@/ui/toaster';

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
] as const;

const TIME_ZONES = [
  { label: 'UTC', value: 'UTC' },
  { label: 'GMT', value: 'GMT' },
  { label: 'EST', value: 'EST' },
  { label: 'CST', value: 'CST' },
  { label: 'MST', value: 'MST' },
  { label: 'PST', value: 'PST' },
];

const SUMMARY_STYLES = [
  { label: 'Concise', value: 'concise', description: 'Straight to the point 1-2 summary of the entry' },
  { label: 'Detailed', value: 'detailed', description: 'A more detailed summary with key points' },
];

const AccountSettings = () => {
  return (
    <div className="flex w-full flex-col gap-8 rounded-2xl border border-black/5 bg-white">
      <div className="px-4 pt-2">
        <h2 className="text-lg text-slate-950">Account</h2>
      </div>

      <div className="flex flex-col gap-2 px-4">
        <label htmlFor="name" className="text-sm font-medium text-slate-950">
          Display Name
        </label>
        <Input id="name" />
      </div>

      <div className="flex w-full items-center justify-end border-t border-slate-100 p-4">
        <Button
          variant="outline"
          className="ml-auto w-full max-w-[100px]"
          onClick={() => {
            toast({ title: 'Settings saved successfully!' });
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
};

const BriefsSettings = () => {
  return (
    <div className="flex w-full flex-col gap-8 rounded-2xl border border-black/5 bg-white">
      <div className="px-4 py-2">
        <h2 className="text-lg">Briefs</h2>
      </div>

      <div className="flex flex-col gap-2 px-4">
        <label htmlFor="day" className="text-sm font-medium text-slate-950">
          Day of Week
        </label>
        <div className="flex items-center gap-4">
          <RadioGroup className="flex w-full items-center justify-around">
            {DAYS.map((day) => {
              const id = `day-${day.toLowerCase()}`;
              return (
                <label
                  key={day}
                  className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center hover:bg-slate-100"
                >
                  <RadioGroupItem value={day} id={id} />
                  <span className="text-xs">{day}</span>
                </label>
              );
            })}
          </RadioGroup>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 px-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="preferred-hour" className="text-sm font-medium text-slate-950">
            Hour
          </label>
          <Select>
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
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="preferred-timezone" className="text-sm font-medium text-slate-950">
            Time Zone
          </label>
          <Select>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a time zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TIME_ZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="px-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-950">Style</label>
          <RadioGroup className="grid grid-cols-2 gap-3">
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
        </div>
      </div>

      <div className="flex flex-col gap-2 px-4">
        <h2 className="text-sm font-medium text-slate-950">Notifications</h2>
        <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <label htmlFor="name" className="text-sm text-slate-950">
            Email
          </label>

          <Switch id="enable-notifications" />
        </div>
      </div>

      <div className="flex w-full items-center justify-end border-t border-slate-100 p-4">
        <Button variant="outline" className="ml-auto w-full max-w-[100px]">
          Save
        </Button>
      </div>
    </div>
  );
};
