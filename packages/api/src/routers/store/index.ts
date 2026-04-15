import { publicProcedure, router } from "../../lib/trpc";
import { aiAssistant } from "./ai-assistant";
import { auth } from "./auth";
import { brand } from "./brand";
import { cart } from "./cart";
import { category } from "./category";
import { customer } from "./customer";
import { order } from "./order";
import { payment } from "./payment";
import { product } from "./product";

export const storeRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	aiAssistant,
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
