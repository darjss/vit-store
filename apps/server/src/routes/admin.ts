import { createDb } from "@vit/api/db";
import {
	bulkSyncProductsToUpstash,
	clearUpstashProductsIndex,
} from "@vit/api/lib/upstash-sync";
import { createLogger, createRequestContext } from "@vit/logger";
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

// POST /admin/sync-upstash
app.post("/sync-upstash", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "admin" });
	const log = createLogger(logContext);
	const startTime = Date.now();

	try {
		log.admin.syncTriggered({ type: "upstash_products" });

		const db = createDb(c.env.DB);

		const products = await db.query.ProductsTable.findMany({
			columns: {
				id: true,
				name: true,
				slug: true,
				price: true,
				description: true,
			},
			where: (table, { isNull, eq, and }) =>
				and(isNull(table.deletedAt), eq(table.status, "active")),
			with: {
				brand: { columns: { name: true } },
				category: { columns: { name: true } },
				images: {
					columns: { url: true },
					where: (table, { isNull, eq, and }) =>
						and(isNull(table.deletedAt), eq(table.isPrimary, true)),
				},
			},
		});

		log.info("sync.products_found", { count: products.length });

		if (products.length === 0) {
			return c.json({
				message: "No products to sync",
				success: 0,
				failed: 0,
				total: 0,
			});
		}
		const clear = await clearUpstashProductsIndex();
		const result = await bulkSyncProductsToUpstash(products);
		const durationMs = Date.now() - startTime;

		log.info("sync.complete", {
			success: result.success,
			failed: result.failed,
			total: products.length,
			durationMs,
		});

		return c.json({
			message: `Synced ${result.success} products to Upstash`,
			success: result.success,
			failed: result.failed,
			total: products.length,
			errors: result.errors.slice(0, 10),
		});
	} catch (error) {
		log.error("sync.failed", error);
		return c.json(
			{
				error: "Failed to sync products to Upstash",
				details: error instanceof Error ? error.message : "Unknown error",
			},
			500,
		);
	}
});

export default app;
