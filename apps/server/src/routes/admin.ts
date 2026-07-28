import {
	getProductSearchStatusResult,
	rebuildProductSearchIndexResult,
} from "@vit/api/lib/product-search/client";
import type { ProductSearchFailure } from "@vit/api/lib/product-search/types";
import { match } from "dismatch";
import { Hono, type Context } from "hono";
import { requireAdminSession } from "../lib/admin-session";
import type { ServerHonoEnv } from "../lib/logging";

const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();

app.use("*", requireAdminSession);

const searchFailureResponse = (
	c: Context<ServerHonoEnv>,
	error: ProductSearchFailure,
) => {
	c.get("log").warn("product_search.operation_failed", {
		error_tag: error._tag,
		code: error.code,
		retryable: error.retryable,
	});
	return match(
		error,
		"_tag",
	)<Response>({
		InvalidSearchRequest: () =>
			c.json({ error: { code: "invalid_request" } }, 400),
		RetryableSearchFailure: () =>
			c.json({ error: { code: "temporarily_unavailable" } }, 503),
		PermanentSearchFailure: () =>
			c.json({ error: { code: "provider_failure" } }, 502),
	});
};

const syncProductSearch = async (
	c: Context<ServerHonoEnv>,
	legacy: boolean,
) => {
	const log = c.get("log");
	log.set({ user_type: "admin", operation: "product_search.sync" });
	const startTime = Date.now();
	log.info("admin.sync_triggered", { type: "product_search" });
	const result = await rebuildProductSearchIndexResult("manual");
	if (result.status === "error") {
		return searchFailureResponse(c, result.error);
	}

	const durationMs = Date.now() - startTime;
	log.info("sync.complete", {
		productCount: result.value.productCount,
		generatedAt: result.value.generatedAt,
		durationMs,
	});
	return c.json({
		message: legacy
			? "Rebuilt product search index via legacy sync-upstash endpoint"
			: "Rebuilt product search index",
		productCount: result.value.productCount,
		generatedAt: result.value.generatedAt,
		lastRebuildFinishedAt: result.value.lastRebuildFinishedAt,
		lastError: result.value.lastError,
	});
};

app.post("/sync-search", (c) => syncProductSearch(c, false));
app.post("/sync-upstash", (c) => syncProductSearch(c, true));
app.get("/search-status", async (c) => {
	const result = await getProductSearchStatusResult();
	return result.status === "error"
		? searchFailureResponse(c, result.error)
		: c.json(result.value);
});

export default app;
