import type { AiOperationError, InboundImage } from "@vit/assistant";
import { Result } from "better-result";
import * as v from "valibot";

export const INBOUND_PREFIX = "messenger-inbound/";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 8_000;
const ALLOWED_IMAGE_HOST_SUFFIXES = [".fbcdn.net", ".fbsbx.com"] as const;

const EXTENSION_BY_TYPE: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
	"image/gif": "gif",
};

const stagedInboundImageSchema = v.strictObject({
	key: v.pipe(v.string(), v.startsWith(INBOUND_PREFIX)),
	size: v.pipe(
		v.number(),
		v.integer(),
		v.minValue(1),
		v.maxValue(MAX_IMAGE_BYTES),
	),
	contentType: v.picklist([
		"image/jpeg",
		"image/png",
		"image/webp",
		"image/gif",
	]),
});

export type StagedInboundImage = v.InferOutput<typeof stagedInboundImageSchema>;

type InboundImageFailure = Extract<
	AiOperationError,
	| { _tag: "ExtractionFailed" }
	| { _tag: "InvalidSource" }
	| { _tag: "NoUsableImages" }
	| { _tag: "ProviderUnavailable" }
>;

export const isAllowedMessengerImageHost = (rawUrl: string) => {
	let parsed: URL;
	try {
		parsed = new URL(rawUrl);
	} catch {
		return false;
	}
	if (parsed.protocol !== "https:") return false;
	const host = parsed.hostname.toLowerCase();
	return ALLOWED_IMAGE_HOST_SUFFIXES.some(
		(suffix) => host === suffix.slice(1) || host.endsWith(suffix),
	);
};

const fetchMessengerImage = async (metaUrl: string, signal?: AbortSignal) => {
	const timeout = AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS);
	const fetchSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
	let response: Response;
	try {
		response = await fetch(metaUrl, { signal: fetchSignal });
	} catch (error) {
		if (
			error instanceof DOMException &&
			error.name === "AbortError" &&
			signal?.aborted
		) {
			throw error;
		}
		return Result.err<Response, InboundImageFailure>({
			_tag: "ExtractionFailed",
			retryable: true,
		});
	}
	if (response.status === 429 || response.status >= 500) {
		return Result.err<Response, InboundImageFailure>({
			_tag: "ExtractionFailed",
			retryable: true,
		});
	}
	if (!response.ok || response.body === null) {
		return Result.err<Response, InboundImageFailure>({
			_tag: "InvalidSource",
		});
	}
	return Result.ok<Response, InboundImageFailure>(response);
};

export const inboundImageKey = (
	sessionId: string,
	messageId: string,
	index: number,
	contentType?: string,
) => {
	const ext = (contentType && EXTENSION_BY_TYPE[contentType]) ?? "img";
	return `${INBOUND_PREFIX}${encodeURIComponent(sessionId)}/${encodeURIComponent(messageId)}-${index}.${ext}`;
};

export const stageInboundImage = async (
	bucket: R2Bucket,
	keyBase: { sessionId: string; messageId: string; index: number },
	metaUrl: string,
	signal?: AbortSignal,
) => {
	if (!isAllowedMessengerImageHost(metaUrl)) {
		return Result.err<StagedInboundImage, InboundImageFailure>({
			_tag: "InvalidSource",
		});
	}

	const fetched = await fetchMessengerImage(metaUrl, signal);
	if (fetched.status === "error") {
		return Result.err<StagedInboundImage, InboundImageFailure>(fetched.error);
	}
	const response = fetched.value;
	const contentType = normalizeImageType(response.headers.get("content-type"));
	if (contentType === undefined) {
		return Result.err<StagedInboundImage, InboundImageFailure>({
			_tag: "NoUsableImages",
		});
	}
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
		return Result.err<StagedInboundImage, InboundImageFailure>({
			_tag: "NoUsableImages",
		});
	}

	const body = response.body;
	if (body === null) {
		return Result.err<StagedInboundImage, InboundImageFailure>({
			_tag: "InvalidSource",
		});
	}
	let bytes: Uint8Array | undefined;
	try {
		bytes = await readWithinCap(body, MAX_IMAGE_BYTES);
	} catch {
		return Result.err<StagedInboundImage, InboundImageFailure>({
			_tag: "ExtractionFailed",
			retryable: true,
		});
	}
	if (bytes === undefined || bytes.byteLength === 0) {
		return Result.err<StagedInboundImage, InboundImageFailure>({
			_tag: "NoUsableImages",
		});
	}

	const key = inboundImageKey(
		keyBase.sessionId,
		keyBase.messageId,
		keyBase.index,
		contentType,
	);
	try {
		await bucket.put(key, bytes, {
			httpMetadata: { contentType },
			customMetadata: {
				source: "messenger-inbound",
				stagedAt: new Date().toISOString(),
			},
		});
	} catch {
		return Result.err<StagedInboundImage, InboundImageFailure>({
			_tag: "ProviderUnavailable",
			retryable: true,
		});
	}
	return Result.ok<StagedInboundImage, InboundImageFailure>(
		v.parse(stagedInboundImageSchema, {
			key,
			size: bytes.byteLength,
			contentType,
		}),
	);
};

export const loadInboundImage = async (bucket: R2Bucket, key: string) => {
	if (!key.startsWith(INBOUND_PREFIX)) {
		return Result.err<InboundImage, InboundImageFailure>({
			_tag: "InvalidSource",
		});
	}
	let object: R2ObjectBody | null;
	try {
		object = await bucket.get(key);
	} catch {
		return Result.err<InboundImage, InboundImageFailure>({
			_tag: "ProviderUnavailable",
			retryable: true,
		});
	}
	if (object === null) {
		return Result.err<InboundImage, InboundImageFailure>({
			_tag: "NoUsableImages",
		});
	}
	try {
		const bytes = new Uint8Array(await object.arrayBuffer());
		if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
			return Result.err<InboundImage, InboundImageFailure>({
				_tag: "NoUsableImages",
			});
		}
		const contentType = normalizeImageType(
			object.httpMetadata?.contentType ?? null,
		);
		if (contentType === undefined) {
			return Result.err<InboundImage, InboundImageFailure>({
				_tag: "NoUsableImages",
			});
		}
		return Result.ok<InboundImage, InboundImageFailure>({ bytes, contentType });
	} catch {
		return Result.err<InboundImage, InboundImageFailure>({
			_tag: "ProviderUnavailable",
			retryable: true,
		});
	}
};

const readWithinCap = async (body: ReadableStream<Uint8Array>, cap: number) => {
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
	const output = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
};

const normalizeImageType = (value: string | null) => {
	if (!value) return undefined;
	const type = value.split(";")[0]?.trim().toLowerCase() ?? "";
	return Object.hasOwn(EXTENSION_BY_TYPE, type) ? type : undefined;
};
