import { publicProcedure, router } from "~/lib/trpc";
import { storeAuthRouter } from "~/routers/store/auth";
import { brand } from "~/routers/store/brand";
import { cart } from "~/routers/store/cart";
import { category } from "~/routers/store/category";
import { customer } from "~/routers/store/customer";
import { order } from "~/routers/store/order";
import { payment } from "~/routers/store/payment";
import { product } from "~/routers/store/product";

export const storeRouter = router({
	auth: storeAuthRouter,
	brand,
	cart,
	category,
	customer,
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	order,
	payment,
	product,
});
export type StoreRouter = typeof storeRouter;
