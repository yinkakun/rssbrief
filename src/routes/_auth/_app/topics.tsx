import { Input } from '@/ui/input';
import { Button } from '@/ui/button';
import { VscAdd } from 'react-icons/vsc';
import { PiDotsThreeVertical, PiPlus, PiX } from 'react-icons/pi';
import { createFileRoute } from '@tanstack/react-router';
import { Dialog, DialogContent, DialogClose, DialogTrigger, DialogTitle } from '@/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/dropdown-menu';

export const Route = createFileRoute('/_auth/_app/topics')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-slate-950">Topics</h1>

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
              <div className="xborder flex flex-col gap-4 rounded-2xl border-slate-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-500">Url</span>
                  <Input type="text" placeholder="Enter topic title" className="flex-1" />
                  <button className="flex size-9 items-center justify-center rounded-lg bg-slate-50 outline-0 transition-colors hover:bg-slate-100">
                    <PiX className="text-slate-500" size={20} />
                  </button>
                </div>

                <Button variant="secondary" size="sm">
                  <PiPlus />
                  <span>Add more</span>
                </Button>
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
      </div>

      <div className="flex flex-1 flex-col gap-20 overflow-y-auto">
        <div className="flex flex-col gap-3">
          <div className="flex gap-6">
            {MOCK_TOPICS.map((topic) => (
              <div
                key={topic.title}
                className="relative min-w-xs overflow-hidden rounded-2xl border border-black/5 bg-white text-slate-700 duration-200 hover:border-black/10"
              >
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <h3 className="text-lg leading-none text-black">{topic.title}</h3>
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
                  {topic.blogs.map((blog, blogIndex) => (
                    <div className="group flex w-fit items-center gap-2 text-slate-600 hover:underline" key={blogIndex}>
                      <div className="size-1.5 rounded-full bg-slate-500 group-hover:bg-slate-700"></div>
                      <span className="truncate group-hover:text-slate-700">{blog}</span>
                    </div>
                  ))}
                </div>

                <div className="pb-3 pl-6">
                  <span className="text-xs text-slate-600">Updated 10 minutes ago</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-2xl text-slate-950">Discover</h2>
          <div className="flex gap-3">
            {MOCK_TOPICS.map((topic, index) => (
              <div
                key={index}
                className="flex items-center gap-2 rounded-full border border-black/10 bg-white p-2 px-6 hover:bg-slate-50"
              >
                <VscAdd className="mr-2" />
                <h3 className="text-sm">{topic.title}</h3>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// topics to follow, topics you follow, topics you created
const MOCK_TOPICS = [
  {
    title: 'Arts',
    blogs: ['artnews.com', 'artsy.net'],
  },
  {
    title: 'Technology',
    blogs: ['techcrunch.com', 'theverge.com'],
  },
];
