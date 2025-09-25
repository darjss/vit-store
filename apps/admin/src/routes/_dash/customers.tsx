import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_dash/customers')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_dash/customers"!</div>
}
