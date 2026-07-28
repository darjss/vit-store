import { publicProcedure, router } from "~/lib/trpc";
import { storeAuthV2Router } from "~/routers/store/auth";
import { brandV2Router } from "~/routers/store/brand";
import { categoryV2Router } from "~/routers/store/category";
import { productV2Router } from "~/routers/store/product";

export const storeV2Router = router({
	healthCheck: publicProcedure.query(() => "OK"),
	auth: storeAuthV2Router,
	brand: brandV2Router,
	category: categoryV2Router,
	product: productV2Router,
});
