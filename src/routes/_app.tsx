import { createFileRoute } from '@tanstack/react-router';
import { Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_app')({
  component: Layout,
});

function Layout() {
  return (
    <div>
      <h1>Authenticated </h1>
      <Outlet />
    </div>
  );
}
