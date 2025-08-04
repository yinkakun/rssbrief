import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@/styles.css';

import * as React from 'react';
import { Toaster } from '@/ui/toaster';
import { QueryClient } from '@tanstack/react-query';
import { Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router';

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <React.Fragment>
      {children}
      <Toaster />
      <Scripts />
    </React.Fragment>
  );
}
