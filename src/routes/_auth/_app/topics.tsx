import { createFileRoute } from '@tanstack/react-router';

import { cn } from '@/lib/utils';
import { Input } from '@/ui/input';
import { toast } from '@/ui/toaster';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogClose, DialogTrigger, DialogTitle } from '@/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';

import { VscAdd } from 'react-icons/vsc';
import { PiDotsThreeVertical, PiPlus, PiX } from 'react-icons/pi';

import { api } from 'convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import { useConvexMutation } from '@convex-dev/react-query';

export const Route = createFileRoute('/_auth/_app/topics')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-full flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-slate-950">Your Topics</h1>
        <CreateTopic />
      </div>

      <div className="grid grid-cols-12 gap-20 overflow-y-auto">
        <div className="col-span-8">
          <FollowedTopics />
        </div>
        <div className="col-span-4">
          <CuratedTopics />
        </div>
      </div>
    </div>
  );
}

const CreateTopic = () => {
  return (
    <div className="w-fit">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">
            <VscAdd className="mr-2" />
            Create New Topic
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Create New Topic</DialogTitle>
          <div className="flex flex-col gap-4 rounded-2xl border-slate-200">
            <div className="flex flex-col gap-5 rounded-2xl border border-black/10 p-4 px-3">
              <Input type="text" placeholder="Enter topic title" />

              <div className="w-fill flex flex-col gap-3 pt-4 pb-0">
                <div className="flex items-center justify-between gap-3">
                  <Input type="text" placeholder="Enter RSS url" className="flex-1" />
                  <button className="flex size-9 items-center justify-center rounded-lg bg-slate-50 outline-0 transition-colors hover:bg-slate-100">
                    <PiX className="text-slate-500" size={20} />
                  </button>
                </div>
                <Button variant="secondary" size="sm" className="w-full">
                  <PiPlus />
                  <span>Add more</span>
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button type="submit">Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const FollowedTopics = () => {
  const userTopicsQuery = useQuery(convexQuery(api.topics.getUserTopics, {}));

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
                    <DropdownMenuItem className="cursor-pointer" onClick={() => alert('Edit Topic')}>
                      Edit Topic
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer" onClick={() => alert('Delete Topic')}>
                      Delete Topic
                    </DropdownMenuItem>
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
              <span className="text-xs text-slate-500">Updated 10 minutes ago</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CuratedTopics = () => {
  const curatedTopicsQuery = useQuery(convexQuery(api.topics.getCuratedTopics, {}));
  const userTopicsQuery = useQuery(convexQuery(api.topics.getUserTopics, {}));

  const followTopicMutation = useMutation({
    mutationFn: useConvexMutation(api.topics.followTopic),
    onSuccess: () => {
      console.log('Topic followed successfully');
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-2xl text-slate-950">Discover</h2>
      <div className="flex flex-wrap gap-3">
        {curatedTopicsQuery.data?.map((topic, index) => {
          const isFollowing = userTopicsQuery.data?.some((userTopic) => userTopic.id === topic.id);

          return (
            <button
              key={index}
              className={cn(
                'flex items-center gap-2 rounded-full border border-black/10 bg-white p-2 px-6 hover:bg-slate-50',
                isFollowing ? 'border-green-300 bg-green-100' : 'hover:bg-slate-50',
              )}
              onClick={() => {
                followTopicMutation.mutate({ topicId: topic.id });
                toast({
                  title: `You are now following ${topic.name} topic`,
                });
              }}
            >
              <VscAdd className="mr-2" />
              <h3 className="text-sm">{topic.name}</h3>
            </button>
          );
        })}
      </div>
    </div>
  );
};
