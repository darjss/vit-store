import {
	type CachePolicy,
	type CatalogCacheAccumulator,
	cacheControlHeader,
} from "@vit/shared";
import type { Context as HonoContext } from "hono";
import type { Context, ServerHonoVariables } from "~/lib/context";

type CacheHonoContext = HonoContext<{
	Bindings: Env;
	Variables: ServerHonoVariables;
}>;

export function markCacheable(
	ctx: Context,
	policy: CachePolicy,
	tags: string[],
): void {
	if (ctx.c.req.method !== "GET") {
		return;
	}

	const existing = ctx.c.get("catalogCache");
	if (!existing) {
		ctx.c.set("catalogCache", {
			maxAge: policy.maxAge,
			staleWhileRevalidate: policy.staleWhileRevalidate,
			tags: new Set(tags),
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
}

export function finalizeCatalogCacheHeaders(c: CacheHonoContext): void {
	const accumulated: CatalogCacheAccumulator | undefined =
		c.get("catalogCache");
	if (!accumulated) {
		return;
	}

	c.res.headers.set(
		"Cache-Control",
		cacheControlHeader({
			maxAge: accumulated.maxAge,
			staleWhileRevalidate: accumulated.staleWhileRevalidate,
		}),
	);
	if (accumulated.tags.size > 0) {
		c.res.headers.set("Cache-Tag", Array.from(accumulated.tags).join(","));
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
