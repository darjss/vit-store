import {
	type CachePolicy,
	type CatalogCacheAccumulator,
	cacheControlHeader,
} from "@vit/shared";
import type { Context as HonoContext } from "hono";
import type { Context, ServerHonoVariables } from "~/lib/context";
import { logger } from "~/lib/logger";

// `cloudflare:workers` is only resolvable inside the Cloudflare Workers
// runtime. Importing it statically breaks any non-Workers consumer, so
// resolve it lazily and no-op when it is unavailable.
let workersCacheModule: typeof import("cloudflare:workers") | null | undefined;

async function getWorkersCacheModule(): Promise<
	typeof import("cloudflare:workers") | null
> {
	if (workersCacheModule !== undefined) {
		return workersCacheModule;
	}
	try {
		workersCacheModule = await import("cloudflare:workers");
	} catch {
		workersCacheModule = null;
	}
	return workersCacheModule;
}

type CacheHonoContext = HonoContext<{
	Bindings: Env;
	Variables: ServerHonoVariables;
}>;

export function markCacheable(
	ctx: Context,
	policy: CachePolicy,
	tags: string[],
): void {
	if (
		ctx.c.req.method !== "GET" ||
		ctx.c.req.header("cookie") ||
		ctx.c.req.header("authorization")
	) {
		return;
	}

	const existing = ctx.c.get("catalogCache");
	if (!existing) {
		ctx.c.set("catalogCache", {
			maxAge: policy.maxAge,
			staleWhileRevalidate: policy.staleWhileRevalidate,
			tags: new Set(tags),
			useMaxAge: policy.useMaxAge ?? false,
		});
		return;
	}

	existing.maxAge = Math.min(existing.maxAge, policy.maxAge);
	existing.staleWhileRevalidate = Math.min(
		existing.staleWhileRevalidate,
		policy.staleWhileRevalidate,
	);
	for (const tag of tags) {
		existing.tags.add(tag);
	}
	existing.useMaxAge ||= policy.useMaxAge ?? false;
}

export function finalizeCatalogCacheHeaders(c: CacheHonoContext): void {
	const accumulated: CatalogCacheAccumulator | undefined =
		c.get("catalogCache");

	// Non-catalog store responses (auth-gated queries, cart, etc.) must not be
	// cached. Without an explicit no-store, the Workers Cache may apply
	// heuristic freshness and serve user-specific data to other users.
	if (!accumulated) {
		c.res.headers.set("Cache-Control", "no-store");
		c.res.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
		return;
	}

	c.res.headers.set(
		"Cache-Control",
		cacheControlHeader({
			maxAge: accumulated.maxAge,
			staleWhileRevalidate: accumulated.staleWhileRevalidate,
			useMaxAge: accumulated.useMaxAge,
		}),
	);
	if (accumulated.tags.size > 0) {
		c.res.headers.set("Cache-Tag", Array.from(accumulated.tags).join(","));
	}
}

export async function purgeTagsGlobal(tags: string[]): Promise<void> {
	if (tags.length === 0) {
		return;
	}

	const mod = await getWorkersCacheModule();
	const globalCache = mod?.cache;
	if (!globalCache) {
		return;
	}

	try {
		await globalCache.purge({ tags });
	} catch (error) {
		logger.error("workers_cache.purge_failed", error, { cache_tags: tags });
	}
}

export async function purgeTags(ctx: Context, tags: string[]): Promise<void> {
	if (!ctx.cache || tags.length === 0) {
		return;
	}

	try {
		await ctx.cache.purge({ tags });
	} catch (error) {
		ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "workers_cache.purge_failed",
			cache_tags: tags,
		});
	}
}
