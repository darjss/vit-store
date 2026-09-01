import { timingSafeEqual } from "@vit/api";
import type { ImageUrlArray } from "@vit/shared";
import { requireAdminSession } from "../lib/admin-session";
import type { ServerHonoEnv } from "../lib/logging";
import { Hono } from "hono";
import { nanoid } from "nanoid";
const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();
const CDN_BASE_URL = "https://cdn.darjs.dev";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_URL_IMAGES = 10;
function extensionFromContentType(contentType: string): string {
	if (contentType.includes("png")) {
		return "png";
	}
	if (contentType.includes("gif")) {
		return "gif";
	}
	if (contentType.includes("webp")) {
		return "webp";
	}
	return "jpg";
}
function sanitizePrefix(prefix: string | undefined): string {
	if (!prefix) {
		return "products/catalog";
	}
	return prefix
		.trim()
		.replaceAll(/\.{2,}/g, "")
		.replaceAll(/[^a-zA-Z0-9/_-]/g, "-")
		.replaceAll(/\/+/g, "/")
		.replaceAll(/^\/+|\/+$/g, "")
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
	log.set({ operation: "upload.products", user_type: "admin" });
	const startTime = Date.now();
	try {
		const formData = await c.req.formData();
		const image = formData.get("image") as unknown as File;
		const productName = formData.get("productName") as string | null;
		const isPrimary = formData.get("isPrimary") === "true";
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
		const generatedId = nanoid();
		let keyPrefix = "";
		if (productName) {
			const sanitizedProductName = productName
				.toLowerCase()
				.replaceAll(/\s+/g, "-")
				.replaceAll(/[^a-z0-9-]/g, "");
			keyPrefix = `products/${sanitizedProductName}/`;
		}
		const carouselKey = `${keyPrefix}${generatedId}.webp`;
		const thumbnailKey = `${keyPrefix}${generatedId}-thumbnail.webp`;
		const imageStream = image.stream();
		const carouselImageResult = c.env.images
			.input(imageStream)
			.transform({
				fit: "contain",
				height: 600,
				width: 800,
			})
			.output({ format: "image/webp" });
		const carouselImage = await carouselImageResult;
		const carouselResponse = carouselImage.response();
		const carouselArrayBuffer = await carouselResponse.arrayBuffer();
		await c.env.r2Bucket.put(carouselKey, carouselArrayBuffer, {
			httpMetadata: {
				cacheControl: "public, max-age=31536000, immutable",
				contentType: "image/webp",
			},
		});
		const carouselUrl = `https://cdn.darjs.dev/${carouselKey}`;
		let thumbnailUrl: string | undefined;
		if (isPrimary) {
			const thumbnailImageStream = image.stream();
			const thumbnailImageResult = c.env.images
				.input(thumbnailImageStream)
				.transform({
					fit: "contain",
					height: 300,
					width: 400,
				})
				.output({ format: "image/webp" });
			const thumbnailImage = await thumbnailImageResult;
			const thumbnailResponse = thumbnailImage.response();
			const thumbnailArrayBuffer = await thumbnailResponse.arrayBuffer();
			await c.env.r2Bucket.put(thumbnailKey, thumbnailArrayBuffer, {
				httpMetadata: {
					cacheControl: "public, max-age=31536000, immutable",
					contentType: "image/webp",
				},
			});
			thumbnailUrl = `${CDN_BASE_URL}/${thumbnailKey}`;
		}
		const durationMs = Date.now() - startTime;
		log.info("upload.success", {
			durationMs,
			isPrimary,
			key: carouselKey,
		});
		const response: {
			key: string;
			message: string;
			thumbnailUrl?: string;
			url: string;
		} = {
			key: carouselKey,
			message: "Uploaded successfully",
			url: carouselUrl,
		};
		if (thumbnailUrl) {
			response.thumbnailUrl = thumbnailUrl;
		}
		return c.json(response);
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
		const image = formData.get("image") as unknown as File;
		const brandName = formData.get("brandName") as string;
		const isSvg = image.type === "image/svg+xml";
		const sanitizedBrandName = brandName
			.toLowerCase()
			.replaceAll(/\s+/g, "-")
			.replaceAll(/[^a-z0-9-]/g, "");
		if (isSvg) {
			const svgArrayBuffer = await image.arrayBuffer();
			await c.env.r2Bucket.put(`brands/${sanitizedBrandName}.svg`, svgArrayBuffer, {
				httpMetadata: {
					cacheControl: "public, max-age=31536000, immutable",
					contentType: "image/svg+xml",
				},
			});
			log.info("upload.brand_success", {
				brandName: sanitizedBrandName,
				format: "svg",
			});
			return c.json({
				message: "Brand image uploaded successfully",
				url: `${CDN_BASE_URL}/brands/${sanitizedBrandName}.svg`,
			});
		}
		const imageStream = image.stream();
		const imageResult = c.env.images
			.input(imageStream)
			.transform({
				fit: "contain",
				height: 800,
				width: 800,
			})
			.output({ format: "image/webp" });
		const brandImage = await imageResult;
		const brandImageResponse = brandImage.response();
		const brandImageArrayBuffer = await brandImageResponse.arrayBuffer();
		await c.env.r2Bucket.put(`brands/${sanitizedBrandName}.webp`, brandImageArrayBuffer, {
			httpMetadata: {
				cacheControl: "public, max-age=31536000, immutable",
				contentType: "image/webp",
			},
		});
		log.info("upload.brand_success", {
			brandName: sanitizedBrandName,
			format: "webp",
		});
		return c.json({
			message: "Brand image uploaded successfully",
			url: `${CDN_BASE_URL}/brands/${sanitizedBrandName}.webp`,
		});
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
	try {
		const uploadPrefix = sanitizePrefix(c.req.query("prefix"));
		const body = (await c.req.json()) as ImageUrlArray;
		if (!Array.isArray(body) || body.length === 0) {
			log.warn("upload.urls_validation_failed", { reason: "empty_array" });
			return c.json({ message: "Array of image URLs required" }, 400);
		}
		if (body.length > MAX_URL_IMAGES) {
			log.warn("upload.urls_validation_failed", {
				count: body.length,
				reason: "too_many",
			});
			return c.json({ message: `Maximum ${MAX_URL_IMAGES} images allowed` }, 400);
		}
		const uploadedImages: Array<{
			url: string;
		}> = [];
		for (let i = 0; i < body.length; i++) {
			const { url } = body[i];
			const isPrimary = i === 0;
			try {
				const imageResponse = await fetch(url, {
					headers: {
						Accept: "image/*",
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					},
				});
				if (!imageResponse.ok) {
					log.warn("upload.url_fetch_failed", {
						status: imageResponse.status,
						url,
					});
					uploadedImages.push({ url });
					continue;
				}
				const contentType = imageResponse.headers.get("content-type");
				if (!contentType?.startsWith("image/")) {
					log.warn("upload.url_invalid_type", { contentType, url });
					uploadedImages.push({ url });
					continue;
				}
				const generatedId = nanoid();
				const rawExt = extensionFromContentType(contentType);
				let carouselKey = `${uploadPrefix}/${generatedId}.webp`;
				const imageArrayBuffer = await imageResponse.arrayBuffer();
				const imageBlob = new Blob([imageArrayBuffer], { type: contentType });
				let wrotePrimaryWithTransform = false;
				try {
					const carouselImageResult = c.env.images
						.input(imageBlob.stream())
						.transform({
							fit: "contain",
							height: 600,
							width: 800,
						})
						.output({ format: "image/webp" });
					const carouselImage = await carouselImageResult;
					const carouselResponse = carouselImage.response();
					const carouselArrayBuffer = await carouselResponse.arrayBuffer();
					await c.env.r2Bucket.put(carouselKey, carouselArrayBuffer, {
						httpMetadata: {
							cacheControl: "public, max-age=31536000, immutable",
							contentType: "image/webp",
						},
					});
					wrotePrimaryWithTransform = true;
				} catch (transformError) {
					log.warn("upload.images_transform_unavailable", {
						error: transformError instanceof Error ? transformError.message : "unknown",
						url,
					});
					carouselKey = `${uploadPrefix}/${generatedId}.${rawExt}`;
					await c.env.r2Bucket.put(carouselKey, imageArrayBuffer, {
						httpMetadata: { cacheControl: "public, max-age=31536000, immutable", contentType },
					});
				}
				const carouselUrl = `${CDN_BASE_URL}/${carouselKey}`;
				if (isPrimary && wrotePrimaryWithTransform) {
					const thumbnailKey = `${uploadPrefix}/${generatedId}-thumbnail.webp`;
					const thumbnailBlob = new Blob([imageArrayBuffer], {
						type: contentType,
					});
					const thumbnailImageResult = c.env.images
						.input(thumbnailBlob.stream())
						.transform({
							fit: "contain",
							height: 300,
							width: 400,
						})
						.output({ format: "image/webp" });
					const thumbnailImage = await thumbnailImageResult;
					const thumbnailResponse = thumbnailImage.response();
					const thumbnailArrayBuffer = await thumbnailResponse.arrayBuffer();
					await c.env.r2Bucket.put(thumbnailKey, thumbnailArrayBuffer, {
						httpMetadata: {
							cacheControl: "public, max-age=31536000, immutable",
							contentType: "image/webp",
						},
					});
				}
				uploadedImages.push({ url: carouselUrl });
			} catch (imageError) {
				log.error(imageError instanceof Error ? imageError : new Error(String(imageError)), {
					event: "upload.url_processing_failed",
					url,
				});
				uploadedImages.push({ url });
			}
		}
		const elapsed = Date.now() - startTime;
		log.info("upload.urls_batch_complete", {
			durationMs: elapsed,
			total: body.length,
			uploaded: uploadedImages.length,
		});
		return c.json({
			images: uploadedImages,
			status: "OK",
			time: elapsed,
		});
	} catch (error) {
		log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "upload.urls_batch_failed",
		});
		return c.json({ message: "Failed to upload images from URLs", status: "ERROR" }, 500);
	}
});
export default app;
