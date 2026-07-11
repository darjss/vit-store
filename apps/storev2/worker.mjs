import { WorkerEntrypoint, cache } from "cloudflare:workers";
import astro from "./dist/server/entry.mjs";

const CACHE_TAG = /^[!-~]{1,128}$/;

export default class Storefront extends WorkerEntrypoint {
	fetch(request) {
		return astro.fetch(request, this.env, this.ctx);
	}

	async purgeCache(tags) {
		if (
			!Array.isArray(tags) ||
			tags.length === 0 ||
			tags.length > 64 ||
			tags.some((tag) => typeof tag !== "string" || !CACHE_TAG.test(tag))
		) {
			throw new TypeError("Invalid cache tags");
		}
		await cache.purge({ tags: [...new Set(tags)] });
	}
}
