import { createFileRoute, Link } from '@tanstack/react-router';
import { Button } from '@/ui/button';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-white p-8 font-serif">
      <div className="flex flex-col gap-8">
        <h1 className="text-[14ch] leading-tight font-light text-black">RSSBrief</h1>

        <p className="max-w-2xl text-[3ch] leading-relaxed text-gray-700">
          Stay informed without the noise. RSSBrief curates and summarizes content from your favorite feeds.
        </p>

        <ul className="flex flex-col gap-4 text-xl text-gray-700">
          <li>1. Subscribe to curated RSS topics or create yours.</li>
          <li>2. Set your delivery schedule and summary preferences.</li>
          <li>3. Get weekly summaries of the most relevant articles in your inbox.</li>
          <li>4. Enjoy clutter-free reading with AI-generated insights.</li>
        </ul>

        <div className="mt-4">
          <Link to="/login">
            <Button size="lg" className="font-sans text-xl">
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
