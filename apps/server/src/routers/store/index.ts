import { publicProcedure, router } from "@/lib/trpc";
import { auth } from "./auth";
import { order } from "./order";
import { payment } from "./payment";
import { product } from "./product";
import { brand } from "./brand";
import { cart } from "./cart";

export const storeRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	auth,
	order,
	brand,
	payment,
	product,
	cart,
});
export type StoreRouter = typeof storeRouter;