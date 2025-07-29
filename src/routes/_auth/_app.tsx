import { Outlet } from '@tanstack/react-router';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/_app')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div>
      <aside>sidebar</aside>
      <Outlet />
    </div>
  );
}
