import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: Index,
});

function Index() {
  return (
    <main className="flex h-full flex-col gap-16 bg-white p-8">
      <h1 className="text-center text-4xl font-bold">RSSBrief</h1>

      <p>RSSBrief emails you a weekly summary and links to your favorite RSS feeds.</p>

      <Link to="/home">Go To Dashboard</Link>
    </main>
  );
}

// import { api } from 'convex/_generated/api';
// import { useMutation } from 'convex/react';
// import { convexQuery } from '@convex-dev/react-query';
// import { useSuspenseQuery } from '@tanstack/react-query';
// const addNumberMutation = useMutation(api.functions.addNumber);
// const addNumberQuery = useSuspenseQuery(convexQuery(api.functions.listNumbers, { count: 10 }));
