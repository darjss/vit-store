import { publicProcedure, router } from "@/lib/trpc";
import { analytics } from "./analytics";
import { auth } from "./auth";
import { category } from "./category";
import { customer } from "./customer";
import { image } from "./image";
import { order } from "./order";
import { product } from "./product";
import { purchase } from "./purchase";
import { sales } from "./sales";
import { brands } from "./brands";

export const adminRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	analytics,
	auth,
	brands,
	category,
	customer,
	image,
	order,
	product,
	purchase,
	sales,
});
export type AdminRouter = typeof adminRouter;
