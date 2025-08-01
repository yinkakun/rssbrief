import { createFileRoute } from '@tanstack/react-router';
import { PiPaperPlaneTiltThin } from 'react-icons/pi';

export const Route = createFileRoute('/_auth/_app/briefs')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-full flex-col gap-4">
      <h1 className="text-2xl text-slate-950">Your Briefs</h1>
      <div className="grid h-full grid-cols-8 gap-6">
        <div className="h-[300px] rounded-3xl border border-black/5 bg-white p-3 duration-200 hover:border-black/10"></div>

        <div className="flex h-[300px] animate-pulse flex-col items-center justify-center gap-4 rounded-3xl border border-black/5 bg-white/80 p-3 hover:border-black/10">
          <div>
            <PiPaperPlaneTiltThin size={80} className="text-black/40" />
          </div>
          <p className="text-sm text-black/60">Your next brief will arrive in 2 days</p>
        </div>
      </div>
    </div>
  );
}
