import { timingSafeEqual } from "@vit/api";
import {
	MAX_IMAGE_SIZE,
	productImageKeyPrefix,
	putToCdn,
	putWebp,
	storeProductImage,
	uploadImageUrls,
} from "@vit/api/lib/product-image-upload";
import { imageUrlArraySchema } from "@vit/shared";
import { requireAdminSession } from "../lib/admin-session";
import type { ServerHonoEnv } from "../lib/logging";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import * as v from "valibot";
const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();
const MAX_URL_IMAGES = 10;

function readImageFile(formData: FormData): File | null {
	const image = formData.get("image");
	return v.is(v.instance(File), image) ? image : null;
}

function readRequiredString(entry: File | string | null): string | null {
	const parsed = v.safeParse(v.pipe(v.string(), v.minLength(1)), entry);
	return parsed.success ? parsed.output : null;
}

/** Scripts send `X-Image-Upload-Token`; the admin UI sends its session cookie. */
const requireUploadTokenOrAdmin: MiddlewareHandler<ServerHonoEnv> = async (c, next) => {
	const expected = c.env.IMAGE_UPLOAD_TOKEN;
	const provided = c.req.header("X-Image-Upload-Token");
	if (expected && provided && (await timingSafeEqual(expected, provided))) {
		c.get("log").set({ user_type: "machine" });
		return next();
	}
	return requireAdminSession(c, next);
};

app.use("/products", requireUploadTokenOrAdmin);
app.use("/images/urls", requireUploadTokenOrAdmin);
app.use("/brands", requireAdminSession);
app.post("/products", async (c) => {
	const log = c.get("log");
	log.set({ operation: "upload.products" });
	const startTime = Date.now();
	try {
		const formData = await c.req.formData();
		const image = readImageFile(formData);
		if (!image) {
			log.warn("upload.validation_failed", { reason: "no_image" });
			return c.json({ message: "Image is required" }, 400);
		}
		if (!image.type.startsWith("image/")) {
			log.warn("upload.validation_failed", {
				reason: "invalid_type",
				type: image.type,
			});
			return c.json({ message: "Invalid image type" }, 400);
		}
		if (image.size > MAX_IMAGE_SIZE) {
			log.warn("upload.validation_failed", {
				reason: "too_large",
				size: image.size,
			});
			return c.json({ message: "Image size is too large" }, 400);
		}
		const { key, url } = await storeProductImage(
			c.env,
			productImageKeyPrefix(c.req.query("prefix")),
			image.stream(),
		);
		log.info("upload.success", { durationMs: Date.now() - startTime, key });
		return c.json({ key, message: "Uploaded successfully", url });
	} catch (error) {
		log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "upload.failed",
		});
		return c.json({ message: "Failed to upload image", status: "ERROR" }, 500);
	}
});
app.post("/brands", async (c) => {
	const log = c.get("log");
	log.set({ operation: "upload.brands", user_type: "admin" });
	try {
		const formData = await c.req.formData();
		const image = readImageFile(formData);
		const brandName = readRequiredString(formData.get("brandName"));
		if (!image || !brandName) {
			log.warn("upload.validation_failed", { reason: "missing_brand_fields" });
			return c.json({ message: "Brand image and name are required" }, 400);
		}
		const isSvg = image.type === "image/svg+xml";
		const sanitizedBrandName = brandName
			.toLowerCase()
			.replaceAll(/\s+/g, "-")
			.replaceAll(/[^a-z0-9-]/g, "");
		const url = isSvg
			? await putToCdn(
					c.env,
					`brands/${sanitizedBrandName}.svg`,
					await image.arrayBuffer(),
					"image/svg+xml",
				)
			: await putWebp(c.env, `brands/${sanitizedBrandName}.webp`, image.stream(), {
					height: 800,
					width: 800,
				});
		log.info("upload.brand_success", {
			brandName: sanitizedBrandName,
			format: isSvg ? "svg" : "webp",
		});
		return c.json({ message: "Brand image uploaded successfully", url });
	} catch (error) {
		log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "upload.brand_failed",
		});
		return c.json({ message: "Failed to upload brand image", status: "ERROR" }, 500);
	}
});
app.post("/images/urls", async (c) => {
	const log = c.get("log");
	log.set({ operation: "upload.urls" });
	const startTime = Date.now();
	let json: unknown;
	try {
		json = await c.req.json();
	} catch {
		log.warn("upload.urls_validation_failed", { reason: "invalid_json" });
		return c.json({ message: "Array of image URLs required" }, 400);
	}
	const parsed = v.safeParse(imageUrlArraySchema, json);
	if (!parsed.success || parsed.output.length === 0) {
		log.warn("upload.urls_validation_failed", { reason: "invalid_body" });
		return c.json({ message: "Array of image URLs required" }, 400);
	}
	if (parsed.output.length > MAX_URL_IMAGES) {
		log.warn("upload.urls_validation_failed", {
			count: parsed.output.length,
			reason: "too_many",
		});
		return c.json({ message: `Maximum ${MAX_URL_IMAGES} images allowed` }, 400);
	}
	const images = await uploadImageUrls(
		c.env,
		log,
		productImageKeyPrefix(c.req.query("prefix")),
		parsed.output.map((image) => image.url),
	);
	const elapsed = Date.now() - startTime;
	log.info("upload.urls_batch_complete", {
		durationMs: elapsed,
		failed: images.filter((image) => !image.ok).length,
		total: images.length,
	});
	return c.json({ images, time: elapsed });
});
export default app;
