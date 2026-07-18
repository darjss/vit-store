import { customerQueries } from "@vit/api/queries";
import * as v from "valibot";
import { customerProcedure, router } from "~/lib/trpc";

export const customer = router({
	getInfo: customerProcedure.query(({ ctx }) => {
		return ctx.session.user;
	}),
	updateAddress: customerProcedure
		.input(
			v.strictObject({
				address: v.optional(v.nullable(v.string())),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const q = customerQueries.store;
			await q.updateCustomerAddress(ctx.session.user.phone, input.address);
		}),
});
