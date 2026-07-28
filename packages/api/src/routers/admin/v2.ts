import { publicProcedure, router } from "~/lib/trpc";
import { aiProductV2 } from "~/routers/admin/ai-product";
import { aiPurchaseV2 } from "~/routers/admin/ai-purchase";
import { analytics } from "~/routers/admin/analytics";
import { adminAuthV2Router } from "~/routers/admin/auth";
import { brandsV2 } from "~/routers/admin/brands";
import { categoryV2 } from "~/routers/admin/category";
import { customerV2 } from "~/routers/admin/customer";
import { imageV2 } from "~/routers/admin/image";
import { orderV2 } from "~/routers/admin/order";
import { paymentV2 } from "~/routers/admin/payment";
import { productImagesV2 } from "~/routers/admin/product-images";
import { productV2 } from "~/routers/admin/product";
import { purchaseV2 } from "~/routers/admin/purchase";
import { sales } from "~/routers/admin/sales";

export const adminV2Router = router({
	healthCheck: publicProcedure.query(() => "OK"),
	aiProduct: aiProductV2,
	aiPurchase: aiPurchaseV2,
	analytics,
	auth: adminAuthV2Router,
	brands: brandsV2,
	category: categoryV2,
	customer: customerV2,
	image: imageV2,
	order: orderV2,
	payment: paymentV2,
	product: productV2,
	productImages: productImagesV2,
	purchase: purchaseV2,
	sales,
});
