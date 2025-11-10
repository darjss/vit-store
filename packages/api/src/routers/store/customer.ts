import { storeQueries } from "@vit/api/queries";
import { updateCustomerSchema } from "../../db/valibot";
import { customerProcedure, router } from "../../lib/trpc";

export const customer = router({
	getInfo: customerProcedure.query(({ ctx }) => {
		return ctx.session.user;
	}),
	updateAddress: customerProcedure
		.input(updateCustomerSchema)
		.mutation(async ({ input }) => {
			const { address, phone } = input;
			await storeQueries.updateCustomerAddress(phone as number, address);
		}),
	
});
