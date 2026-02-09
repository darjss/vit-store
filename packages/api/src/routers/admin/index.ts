import { publicProcedure, router } from "../../lib/trpc";
import { aiProduct } from "./ai-product";
import { analytics } from "./analytics";
import { auth } from "./auth";
import { brands } from "./brands";
import { category } from "./category";
import { customer } from "./customer";
import { image } from "./image";
import { order } from "./order";
import { product } from "./product";
import { productImages } from "./product-images";
import { purchase } from "./purchase";
import { sales } from "./sales";

export const adminRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	aiProduct,
	analytics,
	auth,
	brands,
	category,
	customer,
	image,
	productImages,
	order,
	product,
	purchase,
	sales,
});
export type AdminRouter = typeof adminRouter;
