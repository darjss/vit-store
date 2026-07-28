import { timingSafeEqual } from "@vit/api";
import type {
	UploadProtocolError as UploadError,
	UploadedImage,
	UploadItemFailure,
} from "@vit/shared";
import { Result } from "better-result";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import * as v from "valibot";
import { requireAdminSession } from "../lib/admin-session";
import type { ServerHonoEnv } from "../lib/logging";
import { buildMultiImageUploadResponse } from "../lib/upload-batch";

const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();
const CDN_BASE_URL = "https://cdn.darjs.dev";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_URL_IMAGES = 10;
const REMOTE_IMAGE_TIMEOUT_MS = 10_000;
const ALLOWED_REMOTE_IMAGE_TYPES = [
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
] as const;

const remoteImageRequestSchema = v.pipe(
	v.array(v.unknown()),
	v.minLength(1),
	v.maxLength(MAX_URL_IMAGES),
);

const remoteImageItemSchema = v.strictObject({
	url: v.pipe(
		v.string(),
		v.url(),
		v.check((value) => {
			const protocol = new URL(value).protocol;
			return protocol === "https:" || protocol === "http:";
		}),
	),
});

const contentTypeSchema = v.picklist(ALLOWED_REMOTE_IMAGE_TYPES);

type RemoteUploadBindings = Pick<Env, "images" | "r2Bucket">;

const isUploadFile = (value: unknown): value is File =>
	typeof value === "object" &&
	value !== null &&
	"type" in value &&
	typeof value.type === "string" &&
	"size" in value &&
	typeof value.size === "number" &&
	"stream" in value &&
	typeof value.stream === "function" &&
	"arrayBuffer" in value &&
	typeof value.arrayBuffer === "function";

const readImageWithinLimit = async (response: Response) => {
	if (response.body === null) return undefined;
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > MAX_IMAGE_SIZE) return undefined;
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value === undefined) continue;
			total += value.byteLength;
			if (total > MAX_IMAGE_SIZE) {
				await reader.cancel();
				return undefined;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
};

const uploadRemoteImage = async (
	bindings: RemoteUploadBindings,
	url: string,
	index: number,
	prefix: string,
) => {
	let response: Response;
	try {
		response = await fetch(url, {
			headers: { Accept: "image/*" },
			signal: AbortSignal.timeout(REMOTE_IMAGE_TIMEOUT_MS),
		});
	} catch {
		return {
			ok: false as const,
			error: {
				_tag: "ImageFetchFailed",
				index,
				retryable: true,
			} satisfies UploadError,
		};
	}
	if (!response.ok) {
		return {
			ok: false as const,
			error: {
				_tag: "ImageFetchFailed",
				index,
				retryable: response.status === 429 || response.status >= 500,
			} satisfies UploadError,
		};
	}

	const received = response.headers.get("content-type")?.split(";")[0]?.trim();
	const contentType = v.safeParse(contentTypeSchema, received);
	if (!contentType.success) {
		return {
			ok: false as const,
			error: {
				_tag: "UnsupportedImageType",
				received: received ?? "missing",
				allowed: [...ALLOWED_REMOTE_IMAGE_TYPES],
			} satisfies UploadError,
		};
	}

	let bytes: Uint8Array | undefined;
	try {
		bytes = await readImageWithinLimit(response);
	} catch {
		return {
			ok: false as const,
			error: {
				_tag: "ImageFetchFailed",
				index,
				retryable: true,
			} satisfies UploadError,
		};
	}
	if (bytes === undefined || bytes.byteLength === 0) {
		return {
			ok: false as const,
			error: {
				_tag: "ImageTooLarge",
				maximumBytes: MAX_IMAGE_SIZE,
			} satisfies UploadError,
		};
	}

	let transformed: ArrayBuffer;
	try {
		const image = await bindings.images
			.input(new Blob([bytes], { type: contentType.output }).stream())
			.transform({ width: 800, height: 600, fit: "contain" })
			.output({ format: "image/webp" });
		const transformedResponse = image.response();
		if (!transformedResponse.ok) {
			return {
				ok: false as const,
				error: {
					_tag: "ImageTransformFailed",
					index,
				} satisfies UploadError,
			};
		}
		transformed = await transformedResponse.arrayBuffer();
	} catch {
		return {
			ok: false as const,
			error: {
				_tag: "ImageTransformFailed",
				index,
			} satisfies UploadError,
		};
	}

	const generatedId = nanoid();
	const key = `${prefix}/${generatedId}.webp`;
	try {
		await bindings.r2Bucket.put(key, transformed, {
			httpMetadata: {
				contentType: "image/webp",
				cacheControl: "public, max-age=31536000, immutable",
			},
		});
	} catch {
		return {
			ok: false as const,
			error: {
				_tag: "StorageUnavailable",
				retryable: true,
			} satisfies UploadError,
		};
	}

	return {
		ok: true as const,
		image: { index, url: `${CDN_BASE_URL}/${key}` } satisfies UploadedImage,
	};
};

const transformImage = async (
	images: Env["images"],
	image: File,
	size: { width: number; height: number },
	index: number,
) => {
	try {
		const transformed = await images
			.input(image.stream())
			.transform({ ...size, fit: "contain" })
			.output({ format: "image/webp" });
		const response = transformed.response();
		if (!response.ok) {
			return Result.err<ArrayBuffer, UploadError>({
				_tag: "ImageTransformFailed",
				index,
			});
		}
		return Result.ok<ArrayBuffer, UploadError>(await response.arrayBuffer());
	} catch {
		return Result.err<ArrayBuffer, UploadError>({
			_tag: "ImageTransformFailed",
			index,
		});
	}
};

const storeImage = async (
	bucket: R2Bucket,
	key: string,
	bytes: ArrayBuffer,
	contentType: string,
) => {
	try {
		await bucket.put(key, bytes, {
			httpMetadata: {
				contentType,
				cacheControl: "public, max-age=31536000, immutable",
			},
		});
		return Result.ok<void, UploadError>(undefined);
	} catch {
		return Result.err<void, UploadError>({
			_tag: "StorageUnavailable",
			retryable: true,
		});
	}
};

const prepareBrandImage = async (images: Env["images"], image: File) => {
	if (image.type === "image/svg+xml") {
		try {
			return Result.ok<
				{ bytes: ArrayBuffer; extension: "svg"; contentType: "image/svg+xml" },
				UploadError
			>({
				bytes: await image.arrayBuffer(),
				extension: "svg",
				contentType: "image/svg+xml",
			});
		} catch {
			return Result.err<
				{ bytes: ArrayBuffer; extension: "svg"; contentType: "image/svg+xml" },
				UploadError
			>({ _tag: "ImageTransformFailed", index: 0 });
		}
	}
	const contentType = v.safeParse(contentTypeSchema, image.type);
	if (!contentType.success) {
		return Result.err<
			{ bytes: ArrayBuffer; extension: "webp"; contentType: "image/webp" },
			UploadError
		>({
			_tag: "UnsupportedImageType",
			received: image.type || "missing",
			allowed: [...ALLOWED_REMOTE_IMAGE_TYPES, "image/svg+xml"],
		});
	}
	const transformed = await transformImage(
		images,
		image,
		{ width: 800, height: 800 },
		0,
	);
	return transformed.map((bytes) => ({
		bytes,
		extension: "webp" as const,
		contentType: "image/webp" as const,
	}));
};

const createProductThumbnail = async (
	bindings: RemoteUploadBindings,
	image: File,
	key: string,
	onFailure: (error: UploadError) => void,
) => {
	const thumbnail = await transformImage(
		bindings.images,
		image,
		{ width: 400, height: 300 },
		0,
	);
	if (thumbnail.status === "error") {
		onFailure(thumbnail.error);
		return undefined;
	}
	const stored = await storeImage(
		bindings.r2Bucket,
		key,
		thumbnail.value,
		"image/webp",
	);
	if (stored.status === "error") {
		onFailure(stored.error);
		return undefined;
	}
	return `${CDN_BASE_URL}/${key}`;
};

function sanitizePrefix(prefix: string | undefined): string {
	if (!prefix) return "products/catalog";
	return prefix
		.trim()
		.replace(/\.{2,}/g, "")
		.replace(/[^a-zA-Z0-9/_-]/g, "-")
		.replace(/\/+/g, "/")
		.replace(/^\/+|\/+$/g, "")
		.slice(0, 120);
}
app.use("/products", requireAdminSession);
app.use("/brands", requireAdminSession);
app.use("/images/urls", async (c, next) => {
	const expected = c.env.IMAGE_UPLOAD_TOKEN;
	const provided = c.req.header("X-Image-Upload-Token");
	if (expected && provided && (await timingSafeEqual(expected, provided))) {
		c.get("log").set({ user_type: "machine" });
		return next();
	}
	return requireAdminSession(c, next);
});
app.post("/products", async (c) => {
	const log = c.get("log");
	log.set({ user_type: "admin", operation: "upload.products" });
	const startedAt = Date.now();
	let formData: FormData;
	try {
		formData = await c.req.formData();
	} catch {
		return c.json({ error: { _tag: "ImageRequired" } }, 400);
	}
	const imageValue = formData.get("image");
	if (!isUploadFile(imageValue)) {
		return c.json({ error: { _tag: "ImageRequired" } }, 400);
	}
	const image = imageValue;
	const contentType = v.safeParse(contentTypeSchema, image.type);
	if (!contentType.success) {
		return c.json(
			{
				error: {
					_tag: "UnsupportedImageType",
					received: image.type || "missing",
					allowed: [...ALLOWED_REMOTE_IMAGE_TYPES],
				},
			},
			400,
		);
	}
	if (image.size > MAX_IMAGE_SIZE) {
		return c.json(
			{ error: { _tag: "ImageTooLarge", maximumBytes: MAX_IMAGE_SIZE } },
			400,
		);
	}

	const productNameValue = formData.get("productName");
	const productName =
		typeof productNameValue === "string" ? productNameValue : undefined;
	const isPrimary = formData.get("isPrimary") === "true";
	const generatedId = nanoid();
	const sanitizedProductName = productName
		?.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "");
	const keyPrefix = sanitizedProductName
		? `products/${sanitizedProductName}/`
		: "";
	const carouselKey = `${keyPrefix}${generatedId}.webp`;
	const carousel = await transformImage(
		c.env.images,
		image,
		{ width: 800, height: 600 },
		0,
	);
	if (carousel.status === "error") {
		return c.json({ error: carousel.error }, 502);
	}
	const stored = await storeImage(
		c.env.r2Bucket,
		carouselKey,
		carousel.value,
		"image/webp",
	);
	if (stored.status === "error") {
		return c.json({ error: stored.error }, 503);
	}

	const thumbnailUrl = isPrimary
		? await createProductThumbnail(
				c.env,
				image,
				`${keyPrefix}${generatedId}-thumbnail.webp`,
				(error) =>
					log.warn("upload.thumbnail_failed", {
						error_tag: error._tag,
					}),
			)
		: undefined;

	log.info("upload.success", {
		key: carouselKey,
		isPrimary,
		durationMs: Date.now() - startedAt,
	});
	return c.json({
		message: "Uploaded successfully",
		url: `${CDN_BASE_URL}/${carouselKey}`,
		key: carouselKey,
		...(thumbnailUrl ? { thumbnailUrl } : {}),
	});
});

app.post("/brands", async (c) => {
	const log = c.get("log");
	log.set({ user_type: "admin", operation: "upload.brands" });
	let formData: FormData;
	try {
		formData = await c.req.formData();
	} catch {
		return c.json({ error: { _tag: "ImageRequired" } }, 400);
	}
	const imageValue = formData.get("image");
	const brandNameValue = formData.get("brandName");
	if (!isUploadFile(imageValue) || typeof brandNameValue !== "string") {
		return c.json({ error: { _tag: "ImageRequired" } }, 400);
	}
	const image = imageValue;
	if (image.size > MAX_IMAGE_SIZE) {
		return c.json(
			{ error: { _tag: "ImageTooLarge", maximumBytes: MAX_IMAGE_SIZE } },
			400,
		);
	}
	const sanitizedBrandName = brandNameValue
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9-]/g, "");
	if (!sanitizedBrandName) {
		return c.json({ error: { _tag: "InvalidUploadName" } }, 400);
	}

	const prepared = await prepareBrandImage(c.env.images, image);
	if (prepared.status === "error") {
		return prepared.error._tag === "UnsupportedImageType"
			? c.json({ error: prepared.error }, 400)
			: c.json({ error: prepared.error }, 502);
	}
	const key = `brands/${sanitizedBrandName}.${prepared.value.extension}`;
	const stored = await storeImage(
		c.env.r2Bucket,
		key,
		prepared.value.bytes,
		prepared.value.contentType,
	);
	if (stored.status === "error") {
		return c.json({ error: stored.error }, 503);
	}
	log.info("upload.brand_success", { format: prepared.value.extension });
	return c.json({
		url: `${CDN_BASE_URL}/${key}`,
		message: "Brand image uploaded successfully",
	});
});
app.post("/images/urls", async (c) => {
	const log = c.get("log");
	log.set({ operation: "upload.urls" });
	const startedAt = Date.now();
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		const response = buildMultiImageUploadResponse(
			[],
			[{ index: 0, error: { _tag: "ImageRequired" } }],
			Date.now() - startedAt,
		);
		return c.json(response, 400);
	}
	const parsed = v.safeParse(remoteImageRequestSchema, body);
	if (!parsed.success) {
		const count = Array.isArray(body) ? body.length : 0;
		const error: UploadError =
			count > MAX_URL_IMAGES
				? { _tag: "TooManyImages", maximum: MAX_URL_IMAGES }
				: { _tag: "ImageRequired" };
		const response = buildMultiImageUploadResponse(
			[],
			[{ index: 0, error }],
			Date.now() - startedAt,
		);
		log.warn("upload.urls_validation_failed", {
			error_tag: error._tag,
			count,
		});
		return c.json(response, 400);
	}

	const prefix = sanitizePrefix(c.req.query("prefix"));
	const images: UploadedImage[] = [];
	const failures: UploadItemFailure[] = [];
	for (const [index, item] of parsed.output.entries()) {
		const validatedItem = v.safeParse(remoteImageItemSchema, item);
		if (!validatedItem.success) {
			failures.push({
				index,
				error: { _tag: "InvalidImageUrl", index },
			});
			continue;
		}
		const result = await uploadRemoteImage(
			c.env,
			validatedItem.output.url,
			index,
			prefix,
		);
		if (result.ok) images.push(result.image);
		else failures.push({ index, error: result.error });
	}

	const response = buildMultiImageUploadResponse(
		images,
		failures,
		Date.now() - startedAt,
	);
	log.info("upload.urls_batch_complete", {
		total: parsed.output.length,
		uploaded: images.length,
		failed: failures.length,
		batchStatus: response.status,
		durationMs: response.time,
	});
	if (response.status === "error") return c.json(response, 502);
	if (response.status === "partial") return c.json(response, 207);
	return c.json(response, 200);
});
export default app;
