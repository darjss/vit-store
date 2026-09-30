import { WorkerEntrypoint, cache } from "cloudflare:workers";
import astro from "./dist/server/entry.mjs";

const CACHE_TAG = /^[!-~]{1,128}$/;

/**
 * Worker entrypoint is uploaded unbundled — no bare npm imports.
 * Accept only primitive strings that match Cloudflare cache-tag grammar.
 */
function isCacheTag(tag) {
	// Strict equality rejects boxed strings and other values that only coerce to one.
	return tag === String(tag) && CACHE_TAG.test(tag);
}

export default class Storefront extends WorkerEntrypoint {
	fetch(request) {
		return astro.fetch(request, this.env, this.ctx);
	}

	async purgeCache(tags) {
		if (
			!Array.isArray(tags) ||
			tags.length === 0 ||
			tags.length > 64 ||
			tags.some((tag) => !isCacheTag(tag))
		) {
			throw new TypeError("Invalid cache tags");
		}
		await cache.purge({ tags: [...new Set(tags)] });
	}
}
