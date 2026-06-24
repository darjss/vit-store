import type { InboundImage } from "@vit/assistant";

// Short-lived R2 staging for inbound Messenger photos (ADR 0003). Trusted
// channel code fetches the Meta CDN image promptly (those URLs expire), stores
// it under this prefix, and dispatches ONLY the resulting key to the agent — no
// CDN URL and no base64 in session history. The objects are cleaned up by the
// R2 lifecycle rule on this prefix (see apps/agent/r2-lifecycle.messenger-inbound.json),
// so this is a debug/processing window, not durable storage.
export const INBOUND_PREFIX = "messenger-inbound/";

// Cap the bytes we pull from Meta so a malicious/oversized attachment can't
// blow the Worker memory/subrequest budget. Comfortably above any real product
// photo.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const IMAGE_FETCH_TIMEOUT_MS = 8_000;

// Defense-in-depth host allowlist for the server-side attachment fetch. The url
// is already signature-gated (it only arrives inside an HMAC-verified Meta
// webhook payload), so this is a second fence: even if Meta's payload contract
// shifts or a token leaks, we only ever fetch Meta/Facebook CDN hosts and never
// an attacker-arbitrary origin. Suffix match guards against subdomain spoofing.
const ALLOWED_IMAGE_HOST_SUFFIXES = [".fbcdn.net", ".fbsbx.com"] as const;

const isAllowedImageHost = (rawUrl: string): boolean => {
	let host: string;
	try {
		const parsed = new URL(rawUrl);
		if (parsed.protocol !== "https:") return false;
		host = parsed.hostname.toLowerCase();
	} catch {
		return false;
	}
	return ALLOWED_IMAGE_HOST_SUFFIXES.some(
		(suffix) => host === suffix.slice(1) || host.endsWith(suffix),
	);
};

const EXTENSION_BY_TYPE: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
};

// Build a stable, collision-free R2 key for one attachment of one message.
// Keyed by session + message id + index so a Meta webhook retry of the same mid
// overwrites the same object rather than piling up duplicates.
export const inboundImageKey = (
	sessionId: string,
	messageId: string,
	index: number,
	contentType?: string,
): string => {
	const ext = (contentType && EXTENSION_BY_TYPE[contentType]) ?? "img";
	return `${INBOUND_PREFIX}${encodeURIComponent(sessionId)}/${encodeURIComponent(messageId)}-${index}.${ext}`;
};

export interface StagedInboundImage {
	key: string;
	size: number;
	contentType: string;
}

// Fetch the Meta CDN attachment and stage it in R2 under `key`. Runs in the
// webhook (trusted channel code) BEFORE dispatch so the agent only ever sees
// the key. Returns undefined when the fetch fails or yields no usable image, so
// the caller can skip that attachment without failing the whole webhook.
export const stageInboundImage = async (
	bucket: R2Bucket,
	keyBase: { sessionId: string; messageId: string; index: number },
	metaUrl: string,
	signal?: AbortSignal,
): Promise<StagedInboundImage | undefined> => {
	// Defense in depth: only ever fetch Meta/Facebook CDN hosts (the url is
	// already signature-gated upstream).
	if (!isAllowedImageHost(metaUrl)) return undefined;

	const timeout = AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS);
	const fetchSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

	let response: Response;
	try {
		response = await fetch(metaUrl, { signal: fetchSignal });
	} catch {
		return undefined;
	}
	if (!response.ok || response.body === null) return undefined;

	// Reject a non-image content-type outright rather than coercing it to jpeg —
	// a non-image payload should be skipped, not stored and shipped to vision as
	// a bogus jpeg.
	const contentType = normalizeImageType(response.headers.get("content-type"));
	if (contentType === undefined) return undefined;

	// Cap the body BEFORE buffering it: reject on a declared Content-Length over
	// the cap, then read through a length-limited reader that aborts the stream
	// the moment it crosses the cap — so an oversized/hostile body is never fully
	// pulled into Worker memory.
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return undefined;

	const bytes = await readWithinCap(response.body, MAX_IMAGE_BYTES);
	if (bytes === undefined || bytes.byteLength === 0) return undefined;

	const key = inboundImageKey(
		keyBase.sessionId,
		keyBase.messageId,
		keyBase.index,
		contentType,
	);
	await bucket.put(key, bytes, {
		httpMetadata: { contentType },
		// Marks the object's purpose for anyone auditing the bucket; the actual
		// expiry is enforced by the bucket lifecycle rule on this prefix.
		customMetadata: { source: "messenger-inbound", stagedAt: new Date().toISOString() },
	});
	return { key, size: bytes.byteLength, contentType };
};

// Read a staged image back by key for the vision tool. Returns undefined when
// the object is gone (expired by lifecycle) so the tool degrades gracefully.
export const loadInboundImage = async (
	bucket: R2Bucket,
	key: string,
): Promise<InboundImage | undefined> => {
	const object = await bucket.get(key);
	if (object === null) return undefined;
	const bytes = new Uint8Array(await object.arrayBuffer());
	// The stored object already passed the image-type gate at stage time, so a
	// missing/odd stored content-type falls back to jpeg here rather than failing
	// a read-back of bytes we know are an image.
	const contentType =
		normalizeImageType(object.httpMetadata?.contentType ?? null) ?? "image/jpeg";
	return { bytes, contentType };
};

// Read a response body into memory, aborting (and returning undefined) the
// moment the accumulated bytes exceed `cap`, so an oversized body is never
// fully buffered.
const readWithinCap = async (
	body: ReadableStream<Uint8Array>,
	cap: number,
): Promise<Uint8Array | undefined> => {
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value === undefined) continue;
			total += value.byteLength;
			if (total > cap) {
				await reader.cancel();
				return undefined;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
};

// Normalize a content-type to a bare `image/*` media type, or undefined when it
// is missing or not an image — callers skip non-image payloads rather than
// fabricating a type.
const normalizeImageType = (value: string | null): string | undefined => {
	if (!value) return undefined;
	const type = value.split(";")[0]?.trim().toLowerCase() ?? "";
	return type.startsWith("image/") ? type : undefined;
};
