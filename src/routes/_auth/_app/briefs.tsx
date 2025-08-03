import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { cn } from '@/lib/utils';

import { api } from 'convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import type { Doc, Id } from 'convex/_generated/dataModel';

import { formatRelative } from 'date-fns';
import { ScrollArea } from '@/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/ui/dropdown-menu';
import { Button } from '@/ui/button';

export const Route = createFileRoute('/_auth/_app/briefs')({
  component: RouteComponent,
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
  const [activeBrief, setActiveBrief] = React.useState<BriefItem | null>(null);
  const [selectedTopics, setSelectedTopics] = React.useState<Set<string>>(new Set(['all']));
  const [sortOrder, setSortOrder] = React.useState<'newest' | 'oldest'>('newest');
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
                  <DropdownMenuCheckboxItem checked={sortOrder === 'newest'} onClick={() => setSortOrder('newest')}>
                    Newest
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={sortOrder === 'oldest'} onClick={() => setSortOrder('oldest')}>
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
                        setSelectedTopics(new Set(['all']));
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
                        const newSelected = new Set(selectedTopics);
                        newSelected.delete('all');
                        if (checked) {
                          newSelected.add(topic.id);
                        } else {
                          newSelected.delete(topic.id);
                        }
                        if (newSelected.size === 0) {
                          newSelected.add('all');
                        }
                        setSelectedTopics(newSelected);
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
              {filteredBriefs.map((brief) => {
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
              })}
            </div>
          </ScrollArea>
        </div>
        <div className="flex flex-1 items-start justify-center gap-4 bg-white p-4 pt-10">
          {activeBrief ? (
            <ActiveBrief brief={activeBrief} />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-500">
              <p className="text-2xl text-gray-400">Select a brief</p>
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
      <div>
        <span className="text-sm text-slate-500">
          Brief generated on {new Date(brief.createdAt).toLocaleDateString()}
        </span>
      </div>

      <div className="text-sm text-slate-700">
        <p className="text-base leading-relaxed text-black/90">{brief.summary}</p>
      </div>
    </div>
  );
};
