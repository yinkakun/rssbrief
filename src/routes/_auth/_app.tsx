import { createFileRoute } from '@tanstack/react-router';

import { type IconType } from 'react-icons';
import { type RegisteredRouter, Outlet, Link } from '@tanstack/react-router';

import { api } from 'convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { convexQuery } from '@convex-dev/react-query';
import { useAuthActions } from '@convex-dev/auth/react';

import { PiGearFine } from 'react-icons/pi';
import { VscMapVertical, VscVersions, VscSymbolNumeric } from 'react-icons/vsc';

// todo schedule, follow top topics, summary style,

export const Route = createFileRoute('/_auth/_app')({
  component: RouteComponent,
});

function RouteComponent() {
  // fetch current user here, redirect to onboarding if not onboarded

  const currentUserQuery = useQuery({ ...convexQuery(api.users.getCurrentUser, {}) });

  console.log('Current user:', currentUserQuery.data);

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
              {TOPICS_FOLLOWED.map((topic, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <div className="size-2 rounded-full bg-slate-300"></div>
                  <span className="text-sm text-black/70">{topic.title}</span>
                </div>
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

const TOPICS_FOLLOWED = [{ title: 'Arts' }, { title: 'Technology' }, { title: 'Science' }];
