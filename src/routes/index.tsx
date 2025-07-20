import { api } from 'convex/_generated/api';
import { useMutation } from 'convex/react';
import { convexQuery } from '@convex-dev/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  const addNumberMutation = useMutation(api.functions.addNumber);
  const addNumberQuery = useSuspenseQuery(convexQuery(api.functions.listNumbers, { count: 10 }));

  return (
    <main className="flex h-full flex-col gap-16 bg-white p-8">
      <h1 className="text-center text-4xl font-bold">RSSBrief</h1>
      <div className="mx-auto flex max-w-lg flex-col gap-8">
        <p>Welcome {addNumberQuery.data.viewer ?? 'Anonymous'}!</p>
        <p>
          Click the button below and open this page in another window - this data is persisted in the Convex cloud
          database!
        </p>
        <p>
          <button
            className="bg-dark dark:bg-light text-light dark:text-dark rounded-md border-2 px-4 py-2 text-sm"
            onClick={() => {
              void addNumberMutation({ value: Math.floor(Math.random() * 10) });
            }}
          >
            Add a random number
          </button>
        </p>
        <p>
          Numbers:{' '}
          {addNumberQuery.data.numbers?.length === 0
            ? 'Click the button!'
            : (addNumberQuery.data.numbers?.join(', ') ?? '...')}
        </p>
      </div>
    </main>
  );
}
