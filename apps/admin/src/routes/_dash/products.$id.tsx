import { createFileRoute, useParams } from '@tanstack/react-router'
import { z } from 'zod';
import { useSuspenseQuery } from '@tanstack/react-query';
import { trpc } from '@/utils/trpc';

export const Route = createFileRoute('/_dash/products/$id')({
  component: RouteComponent,
  params: z.object({
    id: z.coerce.number(),
  }),
  loader: async ({ params,context:ctx }) => {
    const id = params.id;
    const product = await ctx.queryClient.ensureQueryData(
      ctx.trpc.product.getProductById.queryOptions({ id }),
    );
    return { product };
    
    
  }
})

function RouteComponent() {
  const { id } = useParams({ from: '/_dash/products/$id' });
  const {data: product } = useSuspenseQuery({
    ...trpc.product.getProductById.queryOptions( {id}),
  });
  return <div>
    <h1>{product.name}</h1>
  </div>
}
