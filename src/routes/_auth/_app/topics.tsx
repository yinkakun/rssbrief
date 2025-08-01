import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/ui/button';
import { VscAdd } from 'react-icons/vsc';
import { PiArrowUpRight, PiDotsSixVertical, PiDotsThreeVertical } from 'react-icons/pi';

export const Route = createFileRoute('/_auth/_app/topics')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-slate-950">Topics</h1>

        <div className="w-fit">
          <Button variant="outline">
            <VscAdd className="mr-2" />
            Create New Topic
          </Button>
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

                    <div className="flex items-center rounded-lg bg-black/3 p-1 hover:bg-black/5">
                      <PiDotsThreeVertical size={24} className="text-slate-700" />
                    </div>
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
