import { createFileRoute } from '@tanstack/react-router';

import { type IconType } from 'react-icons';
import { type RegisteredRouter, Outlet, Link } from '@tanstack/react-router';

import { VscMapVertical, VscVersions, VscRss } from 'react-icons/vsc';
import { PiGearFine, PiSidebarSimple, PiCellTower } from 'react-icons/pi';

export const Route = createFileRoute('/_auth/_app')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="flex h-[100dvh] bg-[#F8F8F8]">
      <div className="h-full basis-[18rem] p-6">
        <aside className="flex h-full w-full flex-col rounded-xl border border-neutral-300">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-300 px-4 py-3">
            <div className="flex items-center gap-1">
              <VscRss size={24} />
              <span>RSS Brief</span>
            </div>

            <button className="flex items-center justify-center rounded-lg p-1 hover:bg-neutral-200">
              <PiSidebarSimple size={20} />
            </button>
          </div>

          <nav className="flex flex-col gap-2 p-3 py-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:border-neutral-300 hover:bg-neutral-100"
                  activeProps={{
                    className: 'border-neutral-300! bg-neutral-100 text-neutral-900',
                  }}
                >
                  <Icon size={20} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
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
  { label: 'Feeds', path: '/feeds', icon: PiCellTower },
  { label: 'Briefs', path: '/briefs', icon: VscVersions },
  { label: 'Topics', path: '/topics', icon: VscMapVertical },
  { label: 'Settings', path: '/settings', icon: PiGearFine },
];
