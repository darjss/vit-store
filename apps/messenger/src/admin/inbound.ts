import type { InboundImage } from "./photo";

// Short-lived R2 staging for inbound Telegram photos (ADR 0003). The webhook
// downloads the Telegram file promptly, stores it under this prefix, and the
// extract tools read it back by key — no bytes in message history. The R2
// lifecycle rule on this prefix cleans the objects, so this is a debug and
// processing window, not durable storage.
export const INBOUND_PREFIX = "messenger-inbound/";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const EXTENSION_BY_TYPE = {
	"image/gif": "gif",
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
} as const satisfies Record<string, string>;

const extensionFor = (contentType: string | undefined): string =>
	contentType === undefined ? "img" : (EXTENSION_BY_TYPE[contentType] ?? "img");

// Stable, collision-free R2 key for one attachment of one message, keyed by
// session + message id + index so a Telegram retry of the same update
// overwrites the same object.
export const inboundImageKey = (
	sessionId: string,
	messageId: string,
	index: number,
	contentType?: string,
): string => {
	const ext = extensionFor(contentType);
	return `${INBOUND_PREFIX}${encodeURIComponent(sessionId)}/${encodeURIComponent(messageId)}-${index}.${ext}`;
};

export interface StagedInboundImage {
	contentType: string;
	key: string;
	size: number;
}

/** Stage pre-fetched image bytes (Telegram getFile download). */
export const stageInboundBytes = async (
	bucket: R2Bucket,
	keyBase: { index: number; messageId: string; sessionId: string },
	bytes: Uint8Array,
	contentType: string,
	source: string,
): Promise<StagedInboundImage | undefined> => {
	if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
		return undefined;
	}
	const normalized = normalizeImageType(contentType);
	if (normalized === undefined) {
		return undefined;
	}

	const key = inboundImageKey(keyBase.sessionId, keyBase.messageId, keyBase.index, normalized);
	await bucket.put(key, bytes, {
		customMetadata: { source, stagedAt: new Date().toISOString() },
		httpMetadata: { contentType: normalized },
	});
	return { contentType: normalized, key, size: bytes.byteLength };
};

// Read a staged image back by key for the extract tools. Returns undefined
// when the object is gone (lifecycle cleanup) so the tool degrades gracefully.
export const loadInboundImage = async (
	bucket: R2Bucket,
	key: string,
): Promise<InboundImage | undefined> => {
	const object = await bucket.get(key);
	if (object === null) {
		return undefined;
	}
	const bytes = new Uint8Array(await object.arrayBuffer());
	// The stored object already passed the image-type gate at stage time, so a
	// missing/odd stored content-type falls back to jpeg here rather than
	// failing a read-back of bytes we know are an image.
	const contentType = normalizeImageType(object.httpMetadata?.contentType ?? null) ?? "image/jpeg";
	return { bytes, contentType };
};

const normalizeImageType = (value: string | null): string | undefined => {
	if (!value) {
		return undefined;
	}
	const type = value.split(";")[0]?.trim().toLowerCase() ?? "";
	return type.startsWith("image/") ? type : undefined;
};
