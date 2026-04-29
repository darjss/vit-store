import { publicProcedure, router } from "../../lib/trpc";
import { aiProduct } from "./ai-product";
import { aiPurchase } from "./ai-purchase";
import { analytics } from "./analytics";
import { adminAuthRouter } from "./auth";
import { brands } from "./brands";
import { category } from "./category";
import { customer } from "./customer";
import { image } from "./image";
import { order } from "./order";
import { payment } from "./payment";
import { product } from "./product";
import { productImages } from "./product-images";
import { purchase } from "./purchase";
import { sales } from "./sales";

export const adminRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	aiProduct,
	aiPurchase,
	analytics,
	auth: adminAuthRouter,
	brands,
	category,
	customer,
	image,
	productImages,
	order,
	payment,
	product,
	purchase,
	sales,
});
export type AdminRouter = typeof adminRouter;
