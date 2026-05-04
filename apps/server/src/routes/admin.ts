import {
	getProductSearchStatus,
	rebuildProductSearchIndex,
} from "@vit/api/lib/product-search/client";
import { createLogger, createRequestContext } from "@vit/logger";
import { Hono } from "hono";
import type { Context } from "hono";

const app = new Hono<{ Bindings: Env }>();

const syncProductSearch = async (
	c: Context<{ Bindings: Env }>,
	legacy: boolean,
) => {
	const logContext = createRequestContext(c.req.raw, { userType: "admin" });
	const log = createLogger(logContext);
	const startTime = Date.now();

	try {
		log.admin.syncTriggered({ type: "product_search" });
		const result = await rebuildProductSearchIndex("manual");
		const durationMs = Date.now() - startTime;

		log.info("sync.complete", {
			productCount: result.productCount,
			generatedAt: result.generatedAt,
			durationMs,
		});

		return c.json({
			message: legacy
				? "Rebuilt product search index via legacy sync-upstash endpoint"
				: "Rebuilt product search index",
			productCount: result.productCount,
			generatedAt: result.generatedAt,
			lastRebuildFinishedAt: result.lastRebuildFinishedAt,
			lastError: result.lastError,
		});
	} catch (error) {
		log.error("sync.failed", error);
		return c.json(
			{
				error: "Failed to rebuild product search index",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
	}
};

app.post("/sync-search", (c) => syncProductSearch(c, false));

app.post("/sync-upstash", (c) => syncProductSearch(c, true));

app.get("/search-status", async (c) => {
	try {
		return c.json(await getProductSearchStatus());
	} catch (error) {
		return c.json(
			{
				error: "Failed to get product search status",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
	}
});

export default app;
