import { publicProcedure, router } from "~/lib/trpc";
import { aiProduct } from "~/routers/admin/ai-product";
import { aiPurchase } from "~/routers/admin/ai-purchase";
import { analytics } from "~/routers/admin/analytics";
import { adminAuthRouter } from "~/routers/admin/auth";
import { brands } from "~/routers/admin/brands";
import { category } from "~/routers/admin/category";
import { customer } from "~/routers/admin/customer";
import { image } from "~/routers/admin/image";
import { order } from "~/routers/admin/order";
import { payment } from "~/routers/admin/payment";
import { product } from "~/routers/admin/product";
import { productImages } from "~/routers/admin/product-images";
import { purchase } from "~/routers/admin/purchase";
import { sales } from "~/routers/admin/sales";

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
