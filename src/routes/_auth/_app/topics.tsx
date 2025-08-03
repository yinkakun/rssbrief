import { createFileRoute } from '@tanstack/react-router';

import { cn } from '@/lib/utils';
import { Input } from '@/ui/input';
import { toast } from '@/ui/toaster';
import { Button } from '@/ui/button';
import { ScrollArea } from '@/ui/scroll-area';
import { Dialog, DialogContent, DialogClose, DialogTrigger, DialogTitle } from '@/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';
import { Spinner } from '@/ui/spinner';
import { formatRelative } from 'date-fns';
import { VscAdd } from 'react-icons/vsc';
import { PiDotsThreeVertical, PiPlus, PiX } from 'react-icons/pi';

import type { Id } from 'convex/_generated/dataModel';

import { api } from 'convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import { useConvexMutation } from '@convex-dev/react-query';

import { useState } from 'react';

import { z } from 'zod/v4';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';

const createTopicSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  urls: z
    .array(
      z.object({
        url: z.string().url('Please enter a valid URL'),
      }),
    )
    .min(1, 'At least one RSS URL is required'),
});

type CreateTopicForm = z.infer<typeof createTopicSchema>;

export const Route = createFileRoute('/_auth/_app/topics')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between gap-4">
        <h1 className="text-2xl text-slate-950">Your Topics</h1>
        <CreateTopic />
      </div>

      <div className="grid min-h-0 grow grid-cols-12 gap-20">
        <div className="col-span-8 h-full overflow-hidden">
          <ScrollArea className="h-full">
            <FollowedTopics />
          </ScrollArea>
        </div>

        <div className="col-span-4 h-full overflow-hidden">
          <ScrollArea className="h-full">
            <CuratedTopics />
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

const CreateTopic = () => {
  const [open, setOpen] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateTopicForm>({
    resolver: zodResolver(createTopicSchema),
    defaultValues: {
      title: '',
      urls: [{ url: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'urls',
  });

  const createTopicMutation = useMutation({
    mutationFn: useConvexMutation(api.topics.createUserTopic),
    onSuccess: () => {
      reset();
      setOpen(false);
      toast({
        title: 'Topic created successfully!',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to create topic',
      });
    },
  });

  const onSubmit = (data: CreateTopicForm) => {
    createTopicMutation.mutate({
      name: data.title.trim(),
      rssUrls: data.urls.map((item) => item.url.trim()).filter((url) => url !== ''),
    });
  };

  return (
    <div className="w-fit">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline">
            <VscAdd className="mr-2" />
            Create New Topic
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Create New Topic</DialogTitle>
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="flex flex-col gap-4 rounded-2xl border-slate-200">
              <div className="flex flex-col gap-5 rounded-2xl border border-black/10 p-4 px-3">
                <div className="relative flex flex-col gap-2">
                  <Input type="text" placeholder="Enter topic title" {...register('title')} />
                  {errors.title && (
                    <span className="absolute -bottom-5 pl-2 text-xs text-red-500">{errors.title.message}</span>
                  )}
                </div>

                <div className="w-fill flex flex-col gap-4 pt-4 pb-0">
                  {fields.map((field, index) => (
                    <div key={field.id} className="mt-2 flex items-center justify-between gap-4">
                      <div className="relative flex flex-1 flex-col">
                        <Input type="text" placeholder="Enter RSS url" {...register(`urls.${index}.url`)} />
                        {errors.urls?.[index]?.url && (
                          <span className="absolute -bottom-4 pl-2 text-xs text-red-500">
                            {errors.urls[index]?.url?.message}
                          </span>
                        )}
                      </div>
                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="flex size-9 items-center justify-center rounded-lg bg-slate-50 outline-0 transition-colors hover:bg-slate-100"
                        >
                          <PiX className="text-slate-500" size={20} />
                        </button>
                      )}
                    </div>
                  ))}
                  {errors.urls && <span className="text-sm text-red-500">{errors.urls.message}</span>}
                  <Button
                    size="sm"
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => append({ url: '' })}
                  >
                    <PiPlus />
                    <span>Add more</span>
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <DialogClose asChild>
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting || createTopicMutation.isPending} className="w-full">
                {createTopicMutation.isPending ? <Spinner className="size-4" /> : 'Create Topic'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const FollowedTopics = () => {
  const userTopicsQuery = useQuery(convexQuery(api.topics.getUserTopics, {}));

  const unfollowTopicMutation = useMutation({
    mutationFn: useConvexMutation(api.topics.unfollowTopic),
    onSuccess: () => {
      userTopicsQuery.refetch();
      toast({
        title: 'You have successfully unfollowed the topic.',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to unfollow topic',
      });
    },
  });

  const bookmarkTopicMutation = useMutation({
    mutationFn: useConvexMutation(api.topics.bookmarkTopic),
    onSuccess: () => {
      userTopicsQuery.refetch();
      toast({
        title: 'Topic bookmarked successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to bookmark topic',
      });
    },
  });

  const deleteUserTopicMutation = useMutation({
    mutationFn: useConvexMutation(api.topics.deleteUserTopic),
    onSuccess: () => {
      userTopicsQuery.refetch();
      toast({
        title: 'Topic deleted successfully.',
      });
    },
    onError: () => {
      toast({
        title: 'Failed to delete topic',
      });
    },
  });

  if (!userTopicsQuery.data?.length) {
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

  return (
    <div className="grid grid-cols-3 gap-6">
      {userTopicsQuery.data?.map((topic) => {
        return (
          <div
            key={topic.id}
            className="relative flex flex-col rounded-2xl border border-black/5 bg-white text-slate-700 duration-200 hover:border-black/10"
          >
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <h3 className="text-lg leading-none text-black">{topic.name}</h3>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center rounded-lg bg-black/3 p-1 outline-0 hover:bg-black/5">
                      <PiDotsThreeVertical size={24} className="text-slate-700" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => bookmarkTopicMutation.mutate({ topicId: topic.id, bookmarked: !topic.bookmarked })}
                    >
                      Bookmark
                    </DropdownMenuItem>
                    {topic.userId ? (
                      <DropdownMenuItem
                        onClick={() => deleteUserTopicMutation.mutate({ topicId: topic.id })}
                        className="cursor-pointer text-red-500 hover:bg-red-100"
                      >
                        Delete
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => unfollowTopicMutation.mutate({ topicId: topic.id })}
                        className="cursor-pointer text-red-500 hover:bg-red-100"
                      >
                        Unfollow
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex flex-col gap-2 p-4 pt-0 text-sm">
              {topic.feeds.map((feed) => {
                const url = new URL(feed?.url!);

                return (
                  <div className="group flex w-full items-center gap-2 text-slate-700" key={feed?.id}>
                    <div className="size-1.5 rounded-full bg-slate-950 group-hover:bg-slate-700"></div>
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

            <div className="mt-auto pb-3 pl-6">
              <span className="text-xs text-slate-500">
                Created {formatRelative(new Date(topic.createdAt), new Date())}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CuratedTopics = () => {
  const [pendingTopics, setPendingTopics] = useState<Set<Id<'topics'>>>(new Set());
  const curatedTopicsQuery = useQuery(
    convexQuery(api.topics.getCuratedTopics, {
      limit: 300,
    }),
  );
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
      toast({
        title: 'Failed to follow topic',
      });
    },
  });

  if (curatedTopicsQuery.isLoading) {
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

  if (!curatedTopicsQuery.data?.length) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl text-slate-950">Discover</h2>
        <p className="text-sm text-slate-500">No curated topics available at the moment.</p>
      </div>
    );
  }

  const unfollowedTopics = curatedTopicsQuery.data.filter(
    (topic) => !userTopicsQuery.data?.some((userTopic) => userTopic.id === topic.id),
  );

  if (!unfollowedTopics.length) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl text-slate-950">Discover</h2>
        <p className="text-sm text-slate-500">You're following all available topics!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl text-slate-950">Discover</h2>
      <div className="flex flex-wrap gap-3">
        {unfollowedTopics.map((topic) => {
          const isPending = pendingTopics.has(topic.id);

          return (
            <button
              key={topic.id}
              disabled={isPending}
              className={cn(
                'flex items-center gap-3 rounded-full border border-black/10 bg-white p-2 px-4 transition-all duration-200',
                {
                  'hover:border-green-300 hover:bg-green-50': !isPending,
                  'cursor-wait': isPending,
                },
              )}
              onClick={() => {
                if (!isPending) {
                  followTopicMutation.mutate({ topicId: topic.id });
                  toast({
                    title: `Following ${topic.name}`,
                  });
                }
              }}
            >
              {isPending ? (
                <Spinner className="size-4 text-green-500" color="black" />
              ) : (
                <VscAdd className="text-green-500" size={16} />
              )}
              <span className="text-sm font-medium">{topic.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
