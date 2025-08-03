import { createFileRoute } from '@tanstack/react-router';

import { api } from 'convex/_generated/api';
import { useMutation } from '@tanstack/react-query';
import { useConvexMutation } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';

export const Route = createFileRoute('/_auth/_app/feeds')({
  component: RouteComponent,
});

function RouteComponent() {
  const userBriefsQuery = useQuery(convexQuery(api.briefs.getUserBriefs, {}));

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h2 className="text-2xl text-slate-900">Briefs</h2>
      </div>

      <div className="flex h-full divide-x divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white">
        <div className="basis-[300px]">
          <div className="flex flex-col divide-y divide-black/50">
            {userBriefsQuery.data?.map((brief) => (
              <div key={brief.id} className="flex flex-col gap-0.5 border-black/5 px-4 py-3 hover:bg-gray-50">
                <span className="mt-2 block text-xs text-slate-500">2 day ago</span>
                <h3 className="text-sm text-slate-900">{brief.title}</h3>
                <p className="mt-1 max-w-xs truncate text-xs text-slate-600">{brief.summary.slice(0, 50)}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-1 items-start justify-center gap-4 bg-white p-4 pt-10">
          <div className="flex h-full w-full max-w-prose flex-col gap-5">
            <h1 className="text-5xl font-medium tracking-tight text-slate-900 capitalize">This is the article title</h1>
            <div>
              <span className="text-sm">Published on last week</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const MOCK_FEEDS = [
  {
    title: 'An example article title',
    url: 'https://technews.example.com/latest-updates',
    excerpt: 'This is a brief excerpt from the article that gives an overview of the content.',
    publishedAt: '2023-10-01T12:00:00Z',
  },
  {
    title: 'Another interesting article',
    url: 'https://technews.example.com/another-article',
    excerpt: 'This article discusses the latest trends in technology and innovation.',
    publishedAt: '2023-10-02T14:30:00Z',
  },
  {
    title: 'Latest updates in tech',
    url: 'https://technews.example.com/latest-tech-updates',
    excerpt: 'An overview of the latest advancements in technology and their implications.',
    publishedAt: '2023-10-03T09:15:00Z',
  },
  {
    title: 'Tech innovations to watch',
    url: 'https://technews.example.com/innovations-to-watch',
    excerpt: 'A look at the most promising technological innovations on the horizon.',
    publishedAt: '2023-10-04T16:45:00Z',
  },
  {
    title: 'Understanding AI advancements',
    url: 'https://technews.example.com/ai-advancements',
    excerpt: 'This article explores the recent advancements in artificial intelligence and their potential impact.',
    publishedAt: '2023-10-05T11:20:00Z',
  },
];
