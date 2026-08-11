import {
	getProductSearchStatus,
	rebuildProductSearchIndex,
} from "@vit/api/lib/product-search/client";
import { Hono } from "hono";
import { requireAdminSession } from "../lib/admin-session";
import type { ServerHonoEnv } from "../lib/logging";

const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();

app.use("*", requireAdminSession);

app.post("/sync-search", async (c) => {
	const log = c.get("log");
	log.set({ user_type: "admin", operation: "product_search.sync" });
	const startedAt = Date.now();

	try {
		const result = await rebuildProductSearchIndex("manual");
		log.info("product_search.sync_complete", {
			product_count: result.productCount,
			generation: result.activeGeneration,
			duration_ms: Date.now() - startedAt,
		});
		return c.json(result);
	} catch (error) {
		log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "product_search.sync_failed",
			duration_ms: Date.now() - startedAt,
		});
		return c.json({ error: "Failed to rebuild product search index" }, 500);
	}
});

app.get("/search-status", async (c) => {
	try {
		return c.json(await getProductSearchStatus());
	} catch {
		return c.json({ error: "Failed to get product search status" }, 500);
	}
});

export default app;
