import React from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { cn } from '@/lib/utils';
import { z } from 'zod';

import { api } from 'convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { formatRelative } from 'date-fns';
import { ScrollArea } from '@/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem } from '@/ui/dropdown-menu';
import { Button } from '@/ui/button';
import { PiEmpty } from 'react-icons/pi';
import { format } from 'date-fns';

const briefsSearchSchema = z.object({
  topics: z.array(z.string()).optional().catch([]),
  sort: z.enum(['newest', 'oldest']).optional().catch('newest'),
});

export const Route = createFileRoute('/_auth/_app/briefs')({
  component: RouteComponent,
  validateSearch: briefsSearchSchema,
});

type BriefItem = Pick<Doc<'briefItems'>, 'title' | 'summary' | 'url'> & {
  createdAt: string;
  id: Id<'briefItems'>;
  topic: {
    name: string;
    id: Id<'topics'>;
  } | null;
};

function RouteComponent() {
  const navigate = useNavigate({ from: Route.fullPath });
  const { topics = [], sort = 'newest' } = Route.useSearch();
  const [activeBrief, setActiveBrief] = React.useState<BriefItem | null>(null);
  
  const selectedTopics = React.useMemo(() => {
    if (topics.length === 0) return new Set(['all']);
    return new Set(topics);
  }, [topics]);
  
  const sortOrder = sort;
  const userBriefsQuery = useQuery(convexQuery(api.briefs.getUserBriefs, {}));
  const userTopicsQuery = useQuery(convexQuery(api.topics.getUserTopics, {}));

  const filteredBriefs = React.useMemo(() => {
    if (!userBriefsQuery.data) return [];

    let briefs = userBriefsQuery.data;

    if (!selectedTopics.has('all')) {
      briefs = briefs.filter((brief) => {
        if (!brief.topic) return false;
        return selectedTopics.has(brief.topic.id);
      });
    }

    return briefs.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [userBriefsQuery.data, selectedTopics, sortOrder]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h2 className="text-2xl text-slate-900">Briefs</h2>
      </div>

      <div className="flex h-full divide-x divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white">
        <div className="basis-[300px]">
          <div className="border-b border-gray-200 p-4">
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2" asChild>
                  <Button variant="outline" size="sm">
                    Sort by
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuCheckboxItem 
                    checked={sortOrder === 'newest'} 
                    onClick={() => navigate({ search: { topics, sort: 'newest' } })}
                  >
                    Newest
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem 
                    checked={sortOrder === 'oldest'} 
                    onClick={() => navigate({ search: { topics, sort: 'oldest' } })}
                  >
                    Oldest
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2" asChild>
                  <Button variant="outline" size="sm">
                    Filter by
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuCheckboxItem
                    checked={selectedTopics.has('all')}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        navigate({ search: { topics: [], sort } });
                      }
                    }}
                  >
                    All Topics
                  </DropdownMenuCheckboxItem>
                  {userTopicsQuery.data?.map((topic) => (
                    <DropdownMenuCheckboxItem
                      key={topic.id}
                      checked={selectedTopics.has(topic.id)}
                      onCheckedChange={(checked) => {
                        const currentTopics = [...topics];
                        if (checked) {
                          if (!currentTopics.includes(topic.id)) {
                            currentTopics.push(topic.id);
                          }
                        } else {
                          const index = currentTopics.indexOf(topic.id);
                          if (index > -1) {
                            currentTopics.splice(index, 1);
                          }
                        }
                        navigate({ search: { topics: currentTopics, sort } });
                      }}
                    >
                      {topic.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <ScrollArea className="h-full">
            <div className="flex flex-col divide-y divide-black/50">
              {filteredBriefs.length > 0 ? (
                filteredBriefs.map((brief) => {
                  const relativeDate = formatRelative(new Date(brief.createdAt), new Date());
                  return (
                    <button
                      onClick={() => setActiveBrief(brief)}
                      key={brief.id}
                      className={cn(
                        'flex flex-col gap-1 border-black/5 px-4 py-3 text-left outline-none hover:bg-gray-50',
                        activeBrief?.id === brief.id ? 'bg-slate-500/5' : 'bg-white',
                      )}
                    >
                      <span className="mt-2 block text-xs text-slate-500 capitalize">{relativeDate}</span>
                      <h3 className="text-sm text-slate-900">{brief.title}</h3>
                      <p className="mt-1 max-w-xs truncate text-xs text-slate-600">{brief.summary.slice(0, 50)}</p>
                    </button>
                  );
                })
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
                  <p className="text-sm text-black/40">Your briefs will appear here once generated</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
        <div className="flex flex-1 items-start justify-center gap-4 bg-white p-4 pt-10">
          {activeBrief ? (
            <ActiveBrief brief={activeBrief} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <PiEmpty size={80} className="text-black/10" />
              <p className="mt-2 text-lg text-black/50">Select a brief to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ActiveBrief = (props: { brief: BriefItem }) => {
  const { brief } = props;
  return (
    <div className="flex h-full w-full max-w-prose flex-col gap-5">
      <h1 className="text-2xl font-medium tracking-tight text-slate-900 capitalize">{brief.title}</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-black/80">
          {format(new Date(brief.createdAt), 'MMMM dd, yyyy')} - {brief.topic ? brief.topic.name : 'No Topic'}
        </span>

        <a
          href={brief.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
        >
          <span className="text-sm">Open original Source</span>
        </a>
      </div>

      <div className="text-sm text-slate-700">
        <p className="font-serif text-lg leading-relaxed text-black/80">{brief.summary}</p>
      </div>
    </div>
  );
};
