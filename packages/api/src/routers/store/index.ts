import { publicProcedure, router } from "../../lib/trpc";
import { auth } from "./auth";
import { brand } from "./brand";
import { cart } from "./cart";
import { customer } from "./customer";
import { order } from "./order";
import { payment } from "./payment";
import { product } from "./product";
import {category} from "./category";

export const storeRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	auth,
	brand,
	customer,
	category,
	payment,
	order,
	product,
	cart,
});
export type StoreRouter = typeof storeRouter;
