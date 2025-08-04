import React from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import { z } from 'zod';
import { formatRelative, format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem } from '@/ui/dropdown-menu';
import { Button } from '@/ui/button';
import { PiEmpty } from 'react-icons/pi';

import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';

const briefsSearchSchema = z.object({
  topics: z.array(z.string()).optional().catch([]),
  sort: z.enum(['newest', 'oldest']).optional().catch('newest'),
});

type BriefItem = {
  title: string;
  summary: string;
  url: string;
  createdAt: string;
  id: string;
  topic: {
    name: string;
    id: string;
  } | null;
};

type Topic = {
  id: Id<'topics'>;
  name: string;
};

type SortOrder = 'newest' | 'oldest';

interface BriefsHeaderProps {
  title: string;
}

interface BriefsLayoutProps {
  sidebar: React.ReactNode;
  content: React.ReactNode;
}

interface BriefsSidebarProps {
  briefs: BriefItem[];
  activeBrief: BriefItem | null;
  onBriefSelect: (brief: BriefItem) => void;
  topics: string[];
  sort: SortOrder;
  userTopics: Topic[];
}

interface BriefsFiltersProps {
  topics: string[];
  sort: SortOrder;
  userTopics: Topic[];
  onSortChange: (sort: SortOrder) => void;
  onTopicsChange: (topics: string[]) => void;
}

interface SortFilterProps {
  sort: SortOrder;
  onSortChange: (sort: SortOrder) => void;
}

interface TopicFilterProps {
  topics: string[];
  userTopics: Topic[];
  onTopicsChange: (topics: string[]) => void;
}

interface BriefsListProps {
  briefs: BriefItem[];
  activeBrief: BriefItem | null;
  onBriefSelect: (brief: BriefItem) => void;
}

interface BriefListItemProps {
  brief: BriefItem;
  isActive: boolean;
  onClick: () => void;
}

interface BriefContentProps {
  brief: BriefItem | null;
}

interface EmptyBriefStateProps {
  message: string;
}

export const Route = createFileRoute('/_auth/_app/briefs')({
  component: BriefsPage,
  validateSearch: briefsSearchSchema,
});

function BriefsPage() {
  const { topics = [], sort = 'newest' } = Route.useSearch();
  const [activeBrief, setActiveBrief] = React.useState<BriefItem | null>(null);

  const userBriefsQuery = useQuery(convexQuery(api.briefs.getUserBriefs, {}));
  const userTopicsQuery = useQuery(convexQuery(api.topics.getUserTopics, {}));

  const selectedTopics = React.useMemo(() => {
    if (topics.length === 0) return new Set(['all']);
    return new Set(topics);
  }, [topics]);

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
      return sort === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [userBriefsQuery.data, selectedTopics, sort]);

  const handleBriefSelect = (brief: BriefItem) => {
    setActiveBrief(brief);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <BriefsHeader title="Briefs" />
      <BriefsLayout
        sidebar={
          <BriefsSidebar
            briefs={filteredBriefs}
            activeBrief={activeBrief}
            onBriefSelect={handleBriefSelect}
            topics={topics}
            sort={sort}
            userTopics={userTopicsQuery.data || []}
          />
        }
        content={<BriefContent brief={activeBrief} />}
      />
    </div>
  );
}

function BriefsHeader({ title }: BriefsHeaderProps) {
  return (
    <div>
      <h2 className="text-2xl text-slate-900">{title}</h2>
    </div>
  );
}

function BriefsLayout({ sidebar, content }: BriefsLayoutProps) {
  return (
    <div className="flex h-full divide-x divide-black/5 overflow-hidden rounded-2xl border border-black/5 bg-white">
      <div className="basis-[300px]">{sidebar}</div>
      <div className="flex flex-1 items-start justify-center gap-4 bg-white p-4 pt-10">{content}</div>
    </div>
  );
}

function BriefsSidebar({ briefs, activeBrief, onBriefSelect, topics, sort, userTopics }: BriefsSidebarProps) {
  const navigate = useNavigate({ from: Route.fullPath });

  const handleSortChange = (newSort: SortOrder) => {
    navigate({ search: { topics, sort: newSort } });
  };

  const handleTopicsChange = (newTopics: string[]) => {
    navigate({ search: { topics: newTopics, sort } });
  };

  return (
    <>
      <BriefsFilters
        topics={topics}
        sort={sort}
        userTopics={userTopics}
        onSortChange={handleSortChange}
        onTopicsChange={handleTopicsChange}
      />
      <ScrollArea className="h-full">
        <BriefsList briefs={briefs} activeBrief={activeBrief} onBriefSelect={onBriefSelect} />
      </ScrollArea>
    </>
  );
}

function BriefsFilters({ topics, sort, userTopics, onSortChange, onTopicsChange }: BriefsFiltersProps) {
  return (
    <div className="border-b border-gray-200 p-4">
      <div className="flex gap-2">
        <SortFilter sort={sort} onSortChange={onSortChange} />
        <TopicFilter topics={topics} userTopics={userTopics} onTopicsChange={onTopicsChange} />
      </div>
    </div>
  );
}

function SortFilter({ sort, onSortChange }: SortFilterProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2" asChild>
        <Button variant="outline" size="sm">
          Sort by
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuCheckboxItem checked={sort === 'newest'} onClick={() => onSortChange('newest')}>
          Newest
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={sort === 'oldest'} onClick={() => onSortChange('oldest')}>
          Oldest
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopicFilter({ topics, userTopics, onTopicsChange }: TopicFilterProps) {
  const selectedTopics = React.useMemo(() => {
    if (topics.length === 0) return new Set(['all']);
    return new Set(topics);
  }, [topics]);

  const handleAllTopicsChange = (checked: boolean) => {
    if (checked) {
      onTopicsChange([]);
    }
  };

  const handleTopicChange = (topicId: string, checked: boolean) => {
    const currentTopics = [...topics];
    if (checked) {
      if (!currentTopics.includes(topicId)) {
        currentTopics.push(topicId);
      }
    } else {
      const index = currentTopics.indexOf(topicId);
      if (index > -1) {
        currentTopics.splice(index, 1);
      }
    }
    onTopicsChange(currentTopics);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2" asChild>
        <Button variant="outline" size="sm">
          Filter by
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuCheckboxItem checked={selectedTopics.has('all')} onCheckedChange={handleAllTopicsChange}>
          All Topics
        </DropdownMenuCheckboxItem>
        {userTopics.map((topic) => (
          <DropdownMenuCheckboxItem
            key={topic.id}
            checked={selectedTopics.has(topic.id)}
            onCheckedChange={(checked) => handleTopicChange(topic.id, checked)}
          >
            {topic.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BriefsList({ briefs, activeBrief, onBriefSelect }: BriefsListProps) {
  if (briefs.length === 0) {
    return <EmptyBriefState message="Your briefs will appear here once generated" />;
  }

  return (
    <div className="flex flex-col divide-y divide-black/50">
      {briefs.map((brief) => (
        <BriefListItem
          key={brief.id}
          brief={brief}
          isActive={activeBrief?.id === brief.id}
          onClick={() => onBriefSelect(brief)}
        />
      ))}
    </div>
  );
}

function BriefListItem({ brief, isActive, onClick }: BriefListItemProps) {
  const relativeDate = formatRelative(new Date(brief.createdAt), new Date());

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col gap-1 border-black/5 px-4 py-3 text-left outline-none hover:bg-gray-50',
        isActive ? 'bg-slate-500/5' : 'bg-white',
      )}
    >
      <span className="mt-2 block text-xs text-slate-500 capitalize">{relativeDate}</span>
      <h3 className="text-sm text-slate-900">{brief.title}</h3>
      <p className="mt-1 max-w-xs truncate text-xs text-slate-600">{brief.summary.slice(0, 50)}</p>
    </button>
  );
}

function BriefContent({ brief }: BriefContentProps) {
  if (!brief) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <PiEmpty size={80} className="text-black/10" />
        <p className="mt-2 text-lg text-black/50">Select a brief to view details</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full max-w-prose flex-col gap-5">
      <h1 className="text-3xl font-medium tracking-tight text-slate-900 capitalize">{brief.title}</h1>
      <BriefMetadata createdAt={brief.createdAt} topicName={brief.topic?.name || 'No Topic'} url={brief.url} />
      <div className="mt-4 font-serif text-lg text-slate-700">
        <ReactMarkdown>{brief.summary}</ReactMarkdown>
      </div>
    </div>
  );
}

function BriefMetadata({ createdAt, topicName, url }: { createdAt: string; topicName: string; url: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-base text-black/70">
        {format(new Date(createdAt), 'MMMM dd, yyyy')} - {topicName}
      </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline"
      >
        <span>Open original Source</span>
      </a>
    </div>
  );
}

function EmptyBriefState({ message }: EmptyBriefStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <p className="text-sm text-black/40">{message}</p>
    </div>
  );
}
