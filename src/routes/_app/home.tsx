import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useAction } from 'convex/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';

export const Route = createFileRoute('/_app/home')({ component: AnotherPage });

function AnotherPage() {
  const callMyAction = useAction(api.functions.myAction);

  const { data } = useSuspenseQuery(convexQuery(api.functions.listNumbers, { count: 10 }));

  return (
    <main className="flex flex-col gap-16 p-8">
      <h1 className="text-center text-4xl font-bold">Convex + Tanstack Start</h1>
      <div className="mx-auto flex max-w-lg flex-col gap-8">
        <p>Numbers: {data.numbers.join(', ')}</p>
        <p>Click the button below to add a random number to the database.</p>
        <p>
          <button
            className="bg-dark dark:bg-light text-light dark:text-dark rounded-md border-2 px-4 py-2 text-sm"
            onClick={() => {
              callMyAction({
                first: Math.round(Math.random() * 100),
              }).then(() => alert('Number added!'));
            }}
          >
            Call action to add a random number
          </button>
        </p>
        <a href="/" className="text-blue-600 underline hover:no-underline">
          Back
        </a>
      </div>
    </main>
  );
}
