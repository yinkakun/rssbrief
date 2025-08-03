import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { formatRelative } from 'date-fns';
import type { FieldError } from 'react-hook-form';

import { VscAdd } from 'react-icons/vsc';
import { PiDotsThreeVertical, PiPlus, PiX } from 'react-icons/pi';

import { cn } from '@/lib/utils';
import { Input } from '@/ui/input';
import { toast } from '@/ui/toaster';
import { Button } from '@/ui/button';
import { ScrollArea } from '@/ui/scroll-area';
import { Dialog, DialogContent, DialogClose, DialogTrigger, DialogTitle } from '@/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { Spinner } from '@/ui/spinner';

import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery, useMutation } from '@tanstack/react-query';
import { convexQuery, useConvexMutation } from '@convex-dev/react-query';

const createTopicSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  urls: z
    .array(
      z.object({
        url: z.url('Please enter a valid URL'),
      }),
    )
    .min(1, 'At least one RSS URL is required'),
});

type CreateTopicForm = z.infer<typeof createTopicSchema>;

export const Route = createFileRoute('/_auth/_app/topics')({
  component: TopicsPage,
});

function TopicsPage() {
  return (
    <div className="flex h-full flex-col gap-4">
      <TopicsHeader />
      <TopicsGrid />
    </div>
  );
}

function TopicsHeader() {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4">
      <h1 className="text-2xl text-slate-950">Your Topics</h1>
      <CreateTopicDialog />
    </div>
  );
}

function TopicsGrid() {
  return (
    <div className="grid min-h-0 grow grid-cols-12 gap-20">
      <div className="col-span-8 h-full overflow-hidden">
        <ScrollArea className="h-full">
          <FollowedTopicsSection />
        </ScrollArea>
      </div>
      <div className="col-span-4 h-full overflow-hidden">
        <ScrollArea className="h-full">
          <CuratedTopicsSection />
        </ScrollArea>
      </div>
    </div>
  );
}

function CreateTopicDialog() {
  const [open, setOpen] = useState(false);

  const form = useForm<CreateTopicForm>({
    resolver: zodResolver(createTopicSchema),
    defaultValues: {
      title: '',
      urls: [{ url: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'urls',
  });

  const createTopicMutation = useMutation({
    mutationFn: useConvexMutation(api.topics.createUserTopic),
    onSuccess: () => {
      form.reset();
      setOpen(false);
      toast({ title: 'Topic created successfully!' });
    },
    onError: () => {
      toast({ title: 'Failed to create topic' });
    },
  });

  const handleSubmit = (data: CreateTopicForm) => {
    const cleanedUrls = data.urls.map((item) => item.url.trim()).filter((url) => url !== '');

    createTopicMutation.mutate({
      name: data.title.trim(),
      rssUrls: cleanedUrls,
    });
  };

  const isLoading = form.formState.isSubmitting || createTopicMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-white">
          <VscAdd className="mr-2" />
          Create New Topic
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Create New Topic</DialogTitle>
        <form onSubmit={form.handleSubmit(handleSubmit)}>
          <CreateTopicForm form={form} fields={fields} onAddUrl={() => append({ url: '' })} onRemoveUrl={remove} />
          <CreateTopicActions isLoading={isLoading} onCancel={() => setOpen(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CreateTopicFormProps {
  form: ReturnType<typeof useForm<CreateTopicForm>>;
  fields: { id: string; url: string }[];
  onAddUrl: () => void;
  onRemoveUrl: (index: number) => void;
}

function CreateTopicForm({ form, fields, onAddUrl, onRemoveUrl }: CreateTopicFormProps) {
  const {
    register,
    formState: { errors },
  } = form;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border-slate-200">
      <div className="flex flex-col gap-5 rounded-2xl border border-black/10 p-4 px-3">
        {/* Title Input */}
        <div className="relative flex flex-col gap-2">
          <Input type="text" placeholder="Enter topic title" {...register('title')} />
          {errors.title && <span className="absolute -bottom-5 pl-2 text-xs text-red-500">{errors.title.message}</span>}
        </div>

        <div className="w-fill flex flex-col gap-4 pt-4 pb-0">
          {fields.map((field, index) => (
            <UrlInputField
              key={field.id}
              index={index}
              register={register}
              error={errors.urls?.[index]?.url}
              canRemove={fields.length > 1}
              onRemove={() => onRemoveUrl(index)}
            />
          ))}
          {errors.urls && <span className="text-sm text-red-500">{errors.urls.message}</span>}
          <Button size="sm" type="button" variant="secondary" className="w-full" onClick={onAddUrl}>
            <PiPlus />
            <span>Add more</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

interface UrlInputFieldProps {
  index: number;
  register: ReturnType<typeof useForm<CreateTopicForm>>['register'];
  error?: FieldError;
  canRemove: boolean;
  onRemove: () => void;
}

function UrlInputField({ index, register, error, canRemove, onRemove }: UrlInputFieldProps) {
  return (
    <div className="mt-2 flex items-center justify-between gap-4">
      <div className="relative flex flex-1 flex-col">
        <Input type="text" placeholder="Enter RSS url" {...register(`urls.${index}.url`)} />
        {error && <span className="absolute -bottom-4 pl-2 text-xs text-red-500">{error.message}</span>}
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex size-9 items-center justify-center rounded-lg bg-slate-50 outline-0 transition-colors hover:bg-slate-100"
        >
          <PiX className="text-slate-500" size={20} />
        </button>
      )}
    </div>
  );
}

interface CreateTopicActionsProps {
  isLoading: boolean;
  onCancel: () => void;
}

function CreateTopicActions({ isLoading, onCancel }: CreateTopicActionsProps) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-4">
      <DialogClose asChild>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </DialogClose>
      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? <Spinner className="size-4" /> : 'Create Topic'}
      </Button>
    </div>
  );
}

function FollowedTopicsSection() {
  const userTopicsQuery = useQuery(convexQuery(api.topics.getUserTopics, {}));

  if (!userTopicsQuery.data?.length) {
    return <EmptyFollowedTopics />;
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      {userTopicsQuery.data.map((topic) => (
        <TopicCard
          key={topic.id}
          topic={{
            ...topic,

            feeds: topic.feeds.filter((feed): feed is { id: Id<'feeds'>; url: string } => feed !== undefined),
          }}
        />
      ))}
    </div>
  );
}

function EmptyFollowedTopics() {
  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="relative flex h-[200px] min-w-xs items-center justify-center overflow-hidden rounded-2xl border border-black/5 bg-white p-2 text-slate-700 duration-200 hover:border-black/10">
        <span className="max-w-[80%] text-center text-base">
          Your followed topics will appear here once you follow some.
        </span>
      </div>
    </div>
  );
}

type Topic = {
  id: Id<'topics'>;
  name: string;
  feeds: { id: Id<'feeds'>; url: string }[];
  createdAt: number;
  userId?: Id<'users'> | null;
  bookmarked?: boolean;
};

interface TopicCardProps {
  topic: Topic;
}

function TopicCard({ topic }: TopicCardProps) {
  const userTopicsQuery = useQuery(convexQuery(api.topics.getUserTopics, {}));

  const unfollowTopicMutation = useMutation({
    mutationFn: useConvexMutation(api.topics.unfollowTopic),
    onSuccess: () => {
      userTopicsQuery.refetch();
      toast({ title: 'You have successfully unfollowed the topic.' });
    },
    onError: () => {
      toast({ title: 'Failed to unfollow topic' });
    },
  });

  const bookmarkTopicMutation = useMutation({
    mutationFn: useConvexMutation(api.topics.bookmarkTopic),
    onSuccess: () => {
      userTopicsQuery.refetch();
      toast({ title: 'Topic bookmarked successfully.' });
    },
    onError: () => {
      toast({ title: 'Failed to bookmark topic' });
    },
  });

  const deleteUserTopicMutation = useMutation({
    mutationFn: useConvexMutation(api.topics.deleteUserTopic),
    onSuccess: () => {
      userTopicsQuery.refetch();
      toast({ title: 'Topic deleted successfully.' });
    },
    onError: () => {
      toast({ title: 'Failed to delete topic' });
    },
  });

  const handleBookmark = () => {
    bookmarkTopicMutation.mutate({
      topicId: topic.id,
      bookmarked: !topic.bookmarked,
    });
  };

  const handleDelete = () => {
    deleteUserTopicMutation.mutate({ topicId: topic.id });
  };

  const handleUnfollow = () => {
    unfollowTopicMutation.mutate({ topicId: topic.id });
  };

  return (
    <div className="relative flex flex-col rounded-2xl border border-black/5 bg-white text-slate-700 duration-200 hover:border-black/10">
      <TopicCardHeader
        topic={topic}
        onBookmark={handleBookmark}
        onDelete={topic.userId ? handleDelete : handleUnfollow}
        isUserTopic={!!topic.userId}
      />
      <TopicCardFeeds feeds={topic.feeds} />
      <TopicCardFooter createdAt={topic.createdAt} />
    </div>
  );
}

interface TopicCardHeaderProps {
  topic: Topic;
  onBookmark: () => void;
  onDelete: () => void;
  isUserTopic: boolean;
}

function TopicCardHeader({ topic, onBookmark, onDelete, isUserTopic }: TopicCardHeaderProps) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg leading-none text-black">{topic.name}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center rounded-lg bg-black/3 p-1 outline-0 hover:bg-black/5">
              <PiDotsThreeVertical size={24} className="text-slate-700" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuItem className="cursor-pointer" onClick={onBookmark}>
              Bookmark
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete} className="cursor-pointer text-red-500 hover:bg-red-100">
              {isUserTopic ? 'Delete' : 'Unfollow'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

interface TopicCardFeedsProps {
  feeds: { id: Id<'feeds'>; url: string }[];
}

function TopicCardFeeds({ feeds }: TopicCardFeedsProps) {
  return (
    <div className="flex flex-col gap-2 p-4 pt-0 text-sm">
      {feeds.map((feed) => {
        const url = new URL(feed?.url!);
        return (
          <div className="group flex w-full items-center gap-2 text-slate-700" key={feed?.id}>
            <div className="size-1.5 rounded-full bg-slate-950 group-hover:bg-slate-700" />
            <a
              target="_blank"
              href={feed?.url}
              rel="noopener noreferrer"
              className="w-fit truncate group-hover:text-slate-700 hover:underline"
            >
              {url.hostname}
            </a>
          </div>
        );
      })}
    </div>
  );
}

interface TopicCardFooterProps {
  createdAt: number;
}

function TopicCardFooter({ createdAt }: TopicCardFooterProps) {
  return (
    <div className="mt-auto pb-3 pl-6">
      <span className="text-xs text-slate-500">Created {formatRelative(new Date(createdAt), new Date())}</span>
    </div>
  );
}

function CuratedTopicsSection() {
  const [pendingTopics, setPendingTopics] = useState<Set<Id<'topics'>>>(new Set());

  const curatedTopicsQuery = useQuery(convexQuery(api.topics.getCuratedTopics, { limit: 300 }));
  const userTopicsQuery = useQuery(convexQuery(api.topics.getUserTopics, {}));

  const followTopicMutation = useMutation({
    mutationFn: useConvexMutation(api.topics.followTopic),
    onMutate: (variables: { topicId: Id<'topics'> }) => {
      setPendingTopics((prev) => new Set(prev).add(variables.topicId));
    },
    onSuccess: (_, variables: { topicId: Id<'topics'> }) => {
      setPendingTopics((prev) => {
        const newSet = new Set(prev);
        newSet.delete(variables.topicId);
        return newSet;
      });
      userTopicsQuery.refetch();
    },
    onError: (_, variables: { topicId: Id<'topics'> }) => {
      setPendingTopics((prev) => {
        const newSet = new Set(prev);
        newSet.delete(variables.topicId);
        return newSet;
      });
      toast({ title: 'Failed to follow topic' });
    },
  });

  if (curatedTopicsQuery.isLoading) {
    return <CuratedTopicsLoading />;
  }

  if (!curatedTopicsQuery.data?.length) {
    return <CuratedTopicsEmpty />;
  }

  const unfollowedTopics = curatedTopicsQuery.data.filter(
    (topic) => !userTopicsQuery.data?.some((userTopic) => userTopic.id === topic.id),
  );

  if (!unfollowedTopics.length) {
    return <CuratedTopicsAllFollowed />;
  }

  const handleFollowTopic = (topicId: Id<'topics'>, topicName: string) => {
    followTopicMutation.mutate({ topicId });
    toast({ title: `Following ${topicName}` });
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl text-slate-950">Discover</h2>
      <div className="flex flex-wrap gap-3">
        {unfollowedTopics.map((topic) => (
          <CuratedTopicButton
            key={topic.id}
            topic={topic}
            isPending={pendingTopics.has(topic.id)}
            onFollow={() => handleFollowTopic(topic.id, topic.name)}
          />
        ))}
      </div>
    </div>
  );
}

function CuratedTopicsLoading() {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl text-slate-950">Discover</h2>
      <div className="flex flex-wrap gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 w-24 animate-pulse rounded-full bg-slate-200" />
        ))}
      </div>
    </div>
  );
}

function CuratedTopicsEmpty() {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl text-slate-950">Discover</h2>
      <p className="text-sm text-slate-500">No curated topics available at the moment.</p>
    </div>
  );
}

function CuratedTopicsAllFollowed() {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl text-slate-950">Discover</h2>
      <p className="text-sm text-slate-500">You're following all available topics!</p>
    </div>
  );
}

interface CuratedTopicButtonProps {
  topic: { id: Id<'topics'>; name: string };
  isPending: boolean;
  onFollow: () => void;
}

function CuratedTopicButton({ topic, isPending, onFollow }: CuratedTopicButtonProps) {
  return (
    <button
      disabled={isPending}
      className={cn(
        'flex items-center gap-3 rounded-full border border-black/10 bg-white p-2 px-4 text-black/80 transition-all duration-200',
        {
          'hover:border-green-200 hover:bg-green-50': !isPending,
          'cursor-wait': isPending,
        },
      )}
      onClick={onFollow}
    >
      {isPending ? <Spinner className="size-4" color="black" /> : <VscAdd className="text-green-400" size={16} />}
      <span className="text-sm font-medium">{topic.name}</span>
    </button>
  );
}
