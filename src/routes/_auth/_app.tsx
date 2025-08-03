import React from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { type RegisteredRouter, Outlet, Link, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';

import { type IconType } from 'react-icons';
import { PiGearFine } from 'react-icons/pi';
import { ThreeDotsScale } from 'react-svg-spinners';
import { VscMapVertical, VscSymbolNumeric } from 'react-icons/vsc';

export const Route = createFileRoute('/_auth/_app')({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const currentUserQuery = useQuery({ ...convexQuery(api.users.getCurrentUser, {}) });
  const userTopicsQuery = useQuery(convexQuery(api.topics.getUserTopics, {}));

  React.useEffect(() => {
    if (currentUserQuery.isSuccess && !currentUserQuery.data?.onboarded) {
      navigate({ to: '/onboarding' });
    }
  }, [currentUserQuery.data, currentUserQuery.isSuccess, navigate]);

  if (currentUserQuery.isLoading || userTopicsQuery.isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-white text-slate-500">
        <ThreeDotsScale width={50} height={50} />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] bg-[#F8F8F8]">
      <div className="basis-[20rem] p-6">
        <aside className="flex h-full w-full flex-col rounded-3xl border border-black/5 bg-white backdrop-blur-lg">
          <div className="flex items-center gap-2 pt-3 pl-4">
            <p className="text-lg text-black">RSSBrief</p>
          </div>
          <nav className="flex flex-col gap-2 p-3 py-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  to={item.path}
                  key={item.path}
                  className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm text-slate-900 duration-200 hover:bg-slate-50"
                  activeProps={{
                    className: 'border-slate-200/50! bg-slate-50 text-slate-700',
                  }}
                >
                  <Icon size={20} className="text-black" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <nav className="flex flex-col gap-3 p-3">
            <div className="flex flex-col gap-2 px-3">
              {userTopicsQuery.data
                ?.filter((topic) => topic.bookmarked)
                .map((topic, index) => (
                  <Link
                    search={{
                      topics: [topic.id],
                    }}
                    to={'/briefs'}
                    key={index}
                    className="flex items-center gap-2 text-sm"
                  >
                    <div className="size-2 rounded-full bg-slate-300"></div>
                    <span className="text-sm text-black/70">{topic.name}</span>
                  </Link>
                ))}
            </div>
          </nav>

          <div className="m-3 mt-auto rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
            <span className="text-sm text-slate-500">
              RSSBrief is powered by{' '}
              <a
                href="https://convex.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                Convex
              </a>{' '}
              and{' '}
              <a
                href="https://resend.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                Resend
              </a>
            </span>
          </div>
        </aside>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <Outlet />
      </div>
    </div>
  );
}

type RoutePaths = RegisteredRouter['routesByPath'];

interface NavItem {
  label: string;
  icon: IconType;
  path: keyof RoutePaths;
}

const navItems: NavItem[] = [
  { label: 'Briefs', path: '/briefs', icon: VscMapVertical },
  { label: 'Topics', path: '/topics', icon: VscSymbolNumeric },
  { label: 'Settings', path: '/settings', icon: PiGearFine },
];
