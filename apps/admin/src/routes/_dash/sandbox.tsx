import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_dash/sandbox')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_dash/sandbox"!</div>
}
