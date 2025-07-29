import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/_app/feeds')({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_app/_auth/feeds"!</div>;
}
