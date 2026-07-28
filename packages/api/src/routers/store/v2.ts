import { publicProcedure, router } from "~/lib/trpc";
import { orderV2 } from "~/routers/store/order";
import { paymentV2 } from "~/routers/store/payment";

export const storeV2Router = router({
	healthCheck: publicProcedure.query(() => "OK"),
	order: orderV2,
	payment: paymentV2,
});
