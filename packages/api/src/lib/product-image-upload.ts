import type { RequestLogger } from "evlog";
import { nanoid } from "nanoid";

export const CDN_BASE_URL = "https://cdn.amerikvitamin.mn";
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const DEFAULT_PRODUCT_IMAGE_PREFIX = "products/catalog";
const PRODUCT_IMAGE_SIZE = { height: 600, width: 800 };
const REMOTE_FETCH_TIMEOUT_MS = 15_000;

type ImageEnv = Pick<Env, "images" | "r2Bucket">;

export type ImageUrlUploadResult =
	| { ok: true; sourceUrl: string; url: string }
	| { error: string; ok: false; sourceUrl: string };

export async function putToCdn(env: ImageEnv, key: string, body: ArrayBuffer, contentType: string) {
	await env.r2Bucket.put(key, body, {
		httpMetadata: { cacheControl: "public, max-age=31536000, immutable", contentType },
	});
	return `${CDN_BASE_URL}/${key}`;
}

export async function putWebp(
	env: ImageEnv,
	key: string,
	input: ReadableStream<Uint8Array>,
	size: { height: number; width: number },
) {
	const output = await env.images
		.input(input)
		.transform({ fit: "contain", ...size })
		.output({ format: "image/webp" });
	return putToCdn(env, key, await output.response().arrayBuffer(), "image/webp");
}

export function productImageKeyPrefix(prefix: string | undefined) {
	const sanitized = (prefix ?? "")
		.trim()
		.replaceAll(/\.{2,}/g, "")
		.replaceAll(/[^a-zA-Z0-9/_-]/g, "-")
		.replaceAll(/\/+/g, "/")
		.replaceAll(/^\/+|\/+$/g, "")
		.slice(0, 120);
	return sanitized || DEFAULT_PRODUCT_IMAGE_PREFIX;
}

export async function storeProductImage(
	env: ImageEnv,
	keyPrefix: string,
	input: ReadableStream<Uint8Array>,
) {
	const key = `${keyPrefix}/${nanoid()}.webp`;
	return { key, url: await putWebp(env, key, input, PRODUCT_IMAGE_SIZE) };
}

async function fetchRemoteImage(sourceUrl: string) {
	const response = await fetch(sourceUrl, {
		headers: {
			Accept: "image/*",
			"User-Agent":
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		},
		signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new Error(`fetch returned HTTP ${response.status}`);
	}
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.startsWith("image/")) {
		throw new Error(`not an image (content-type "${contentType}")`);
	}
	if (Number(response.headers.get("content-length")) > MAX_IMAGE_SIZE) {
		throw new Error(`image is larger than ${MAX_IMAGE_SIZE} bytes`);
	}
	const bytes = await response.arrayBuffer();
	if (bytes.byteLength > MAX_IMAGE_SIZE) {
		throw new Error(`image is larger than ${MAX_IMAGE_SIZE} bytes`);
	}
	return new Blob([bytes]).stream();
}

/** Copies each remote image to the CDN. Results keep input order; a failed item never carries a URL. */
export async function uploadImageUrls(
	env: ImageEnv,
	log: RequestLogger,
	keyPrefix: string,
	sourceUrls: Array<string>,
) {
	const results: Array<ImageUrlUploadResult> = [];
	// Sequential: each image can be 10 MB and the worker has 128 MB.
	for (const sourceUrl of sourceUrls) {
		try {
			const { url } = await storeProductImage(env, keyPrefix, await fetchRemoteImage(sourceUrl));
			results.push({ ok: true, sourceUrl, url });
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.warn("upload.url_failed", { error: message, sourceUrl });
			results.push({ error: message, ok: false, sourceUrl });
		}
	}
	return results;
}
