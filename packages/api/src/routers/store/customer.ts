import { customerQueries } from "@vit/api/queries";
import { updateCustomerSchema } from "../../db/valibot";
import { customerProcedure, router } from "../../lib/trpc";

export const customer = router({
	getInfo: customerProcedure.query(({ ctx }) => {
		return ctx.session.user;
	}),
	updateAddress: customerProcedure
		.input(updateCustomerSchema)
		.mutation(async ({ input }) => {
			const q = customerQueries.store;
			const { address, phone } = input;
			await q.updateCustomerAddress(phone as number, address);
		}),
});
