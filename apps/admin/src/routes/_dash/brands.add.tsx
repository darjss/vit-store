import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_dash/brands/add')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>add brand </div>
}
