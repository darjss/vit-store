import { WorkerEntrypoint, cache } from "cloudflare:workers";
import astro from "./dist/server/entry.mjs";

const CACHE_TAG = /^[!-~]{1,128}$/;

/**
 * Worker entrypoint is uploaded unbundled — no bare npm imports.
 * Accept only JSON string values that match Cloudflare cache-tag grammar.
 */
function isCacheTag(tag) {
	const encoded = JSON.stringify(tag);
	if (encoded === undefined || encoded[0] !== '"' || encoded.at(-1) !== '"') {
		return false;
	}
	return CACHE_TAG.test(JSON.parse(encoded));
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
