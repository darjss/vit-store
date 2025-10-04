import { createFileRoute, useParams } from '@tanstack/react-router'
import { z } from 'zod';
import { useSuspenseQuery } from '@tanstack/react-query';
import { trpc } from '@/utils/trpc';

export const Route = createFileRoute('/_dash/orders/$id')({
  component: RouteComponent,
  params: z.object({
    id: z.coerce.number(),
  }),
  loader: async ({ params,context:ctx }) => {
    const id = params.id;
    const order = await ctx.queryClient.ensureQueryData(
      ctx.trpc.order.getOrderById.queryOptions({ id }),
    );
    return { order };
  }
})

function RouteComponent() {
  const { id } = useParams({ from: '/_dash/orders/$id' });
  const { data: order } = useSuspenseQuery({
    ...trpc.order.getOrderById.queryOptions({ id }),
  });
  return <div>
    <h1>{order.orderNumber}</h1>
  </div>
}
