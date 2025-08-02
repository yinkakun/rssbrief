import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/ui/button';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-white">
      <div className="flex w-full max-w-3xl flex-col items-center p-4 text-center">
        <div className="flex flex-col gap-6">
          <h1 className="text-5xl">Summarized RSS Feeds</h1>
          <p className="text-lg text-slate-800">
            Get weekly email summaries of your RSS feeds. Organize feeds by topic, schedule delivery, and read updates
            without information overload.
          </p>

          <Link to="/login">
            <Button size="lg">Get Started ✨</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
