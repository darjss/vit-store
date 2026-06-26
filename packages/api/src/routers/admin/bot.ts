import { router } from "~/lib/trpc";
import { analyticsBot } from "~/routers/admin/analytics";
import { brandsBot } from "~/routers/admin/brands";
import { categoryBot } from "~/routers/admin/category";
import { customerBot } from "~/routers/admin/customer";
import { imageBot } from "~/routers/admin/image";
import { orderBot } from "~/routers/admin/order";
import { paymentBot } from "~/routers/admin/payment";
import { productBot } from "~/routers/admin/product";
import { productImagesBot } from "~/routers/admin/product-images";
import { purchaseBot } from "~/routers/admin/purchase";
import { salesBot } from "~/routers/admin/sales";

// Bot-facing router: token-authed (X-Admin-Bot-Token) surface for the admin
// Messenger agent Worker. Same resolvers as the admin dashboard router, just a
// different auth gate. Excludes the auth router (admin users/sessions are
// dashboard-only). Also excludes aiProduct and aiPurchase (heavy AI ingestion
// flows — issue #110).
export const botRouter = router({
	analytics: analyticsBot,
	brands: brandsBot,
	category: categoryBot,
	customer: customerBot,
	image: imageBot,
	order: orderBot,
	payment: paymentBot,
	product: productBot,
	productImages: productImagesBot,
	purchase: purchaseBot,
	sales: salesBot,
});
export type BotRouter = typeof botRouter;
