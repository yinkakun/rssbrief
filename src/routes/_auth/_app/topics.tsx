import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/_app/topics')({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/_auth/_app/topics"!</div>;
}
