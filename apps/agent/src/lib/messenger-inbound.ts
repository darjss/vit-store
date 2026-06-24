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
	const timeout = AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS);
	const fetchSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

	let response: Response;
	try {
		response = await fetch(metaUrl, { signal: fetchSignal });
	} catch {
		return undefined;
	}
	if (!response.ok || response.body === null) return undefined;

	const contentType = normalizeImageType(response.headers.get("content-type"));
	const buffer = await response.arrayBuffer();
	if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
		return undefined;
	}

	const key = inboundImageKey(
		keyBase.sessionId,
		keyBase.messageId,
		keyBase.index,
		contentType,
	);
	const bytes = new Uint8Array(buffer);
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
	const contentType = normalizeImageType(
		object.httpMetadata?.contentType ?? null,
	);
	return { bytes, contentType };
};

const normalizeImageType = (value: string | null): string => {
	if (!value) return "image/jpeg";
	const type = value.split(";")[0]?.trim().toLowerCase() ?? "";
	return type.startsWith("image/") ? type : "image/jpeg";
};
