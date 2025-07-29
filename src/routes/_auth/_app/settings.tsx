import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_auth/_app/settings')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_layout/_auth/_app/settings"!</div>
}
