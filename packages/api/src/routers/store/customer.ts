import { eq } from "drizzle-orm";
import { CustomersTable } from "../../db/schema";
import { updateCustomerSchema } from "../../db/valibot";
import { customerProcedure, router } from "../../lib/trpc";

export const customer = router({
	getInfo: customerProcedure.query(({ ctx }) => {
		return ctx.session.user;
	}),
	updateAddress: customerProcedure
		.input(updateCustomerSchema)
		.mutation(async ({ input, ctx }) => {
			const { address, phone } = input;
			await ctx.db
				.update(CustomersTable)
				.set({
					address: address,
				})
				.where(eq(CustomersTable.phone, phone as number));
		}),
});
