import * as v from "valibot";

import { publicProcedure, router } from "../../lib/trpc";

export const cart = router({
	hello: publicProcedure
		.input(v.object({ text: v.string() }))
		.query(({ input }) => {
			return {
				greeting: `Hello ${input.text}`,
			};
		}),

	//   create: publicProcedure
	//     .input(v.object({ name: v.pipe(v.string(), v.minLength(1)) }))
	//     .mutation(async ({ ctx, input }) => {
	//       await ctx.db.insert(posts).values({
	//         name: input.name,
	//       });
	//     }),

	//   getLatest: publicProcedure.query(async ({ ctx }) => {
	//     const post = await ctx.db.query.posts.findFirst({
	//       orderBy: (posts, { desc }) => [desc(posts.createdAt)],
	//     });

	//     return post ?? null;
	//   }),
});
