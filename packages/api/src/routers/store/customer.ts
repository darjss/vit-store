import { storeQueries } from "@vit/api/queries";
import { updateCustomerSchema } from "../../db/valibot";
import { customerProcedure, router } from "../../lib/trpc";

export const customer = router({
	getInfo: customerProcedure.query(({ ctx }) => {
		return ctx.session.user;
	}),
	updateAddress: customerProcedure
		.input(updateCustomerSchema)
		.mutation(async ({ input, ctx }) => {
			const q = storeQueries(ctx.db);
			const { address, phone } = input;
			await q.updateCustomerAddress(phone as number, address);
		}),
	
});
