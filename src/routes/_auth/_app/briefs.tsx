import { createFileRoute } from '@tanstack/react-router';
import { PiPaperPlaneTiltThin } from 'react-icons/pi';

import { formatRelative } from 'date-fns';

import { api } from 'convex/_generated/api';
import { useMutation } from '@tanstack/react-query';
import { useConvexMutation } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';

export const Route = createFileRoute('/_auth/_app/briefs')({
  component: RouteComponent,
});

function RouteComponent() {
  const nextBriefScheduleQuery = useQuery(convexQuery(api.briefs.getNextBriefSchedule, {}));
  // const briefsQuery = useQuery(convexQuery(api.briefs.getUserBriefs, {}));

  // console.log('Briefs:', briefsQuery.data);

  const nextBriefTime = formatRelative(nextBriefScheduleQuery.data ?? 0, new Date());

  return (
    <div className="flex h-full flex-col gap-4">
      <h1 className="text-2xl text-slate-950">Your Briefs</h1>
      <div className="grid h-full grid-cols-3 gap-6">
        <div className="h-[300px] rounded-3xl border border-black/5 bg-white p-3 duration-200 hover:border-black/10"></div>

        <div className="flex h-[300px] flex-col items-center justify-center gap-4 rounded-3xl border border-black/5 bg-white/80 p-3">
          <div>
            <PiPaperPlaneTiltThin size={80} className="text-black/40" />
          </div>
          <p className="text-sm text-black/60">Your next brief will arrive on {nextBriefTime}</p>
        </div>
      </div>
    </div>
  );
}
