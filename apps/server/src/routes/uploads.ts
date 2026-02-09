import { createLogger, createRequestContext } from "@vit/logger";
import { Hono } from "hono";
import { nanoid } from "nanoid";

const app = new Hono<{ Bindings: Env }>();

const CDN_BASE_URL = "https://cdn.darjs.dev";
const R2_PUBLIC_URL = "https://pub-b7dba2c2817f4a82971b1c3a86e3dafa.r2.dev";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_URL_IMAGES = 10;

type ImageUrlArray = { url: string }[];

// POST /upload/products (main product images)
app.post("/products", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "admin" });
	const log = createLogger(logContext);
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
				.replace(/\s+/g, "-")
				.replace(/[^a-z0-9-]/g, "");
			keyPrefix = `products/${sanitizedProductName}/`;
		}

		const carouselKey = `${keyPrefix}${generatedId}.webp`;
		const thumbnailKey = `${keyPrefix}${generatedId}-thumbnail.webp`;

		const imageStream = image.stream();

		const carouselImageResult = c.env.images
			.input(imageStream)
			.transform({
				width: 800,
				height: 600,
				fit: "contain",
			})
			.output({ format: "image/webp" });

		const carouselImage = await carouselImageResult;
		const carouselResponse = carouselImage.response();
		const carouselArrayBuffer = await carouselResponse.arrayBuffer();

		await c.env.r2Bucket.put(carouselKey, carouselArrayBuffer, {
			httpMetadata: { contentType: "image/webp" },
		});

		const carouselUrl = `https://cdn.darjs.dev/${carouselKey}`;
		let thumbnailUrl: string | undefined;

		if (isPrimary) {
			const thumbnailImageStream = image.stream();

			const thumbnailImageResult = c.env.images
				.input(thumbnailImageStream)
				.transform({
					width: 400,
					height: 300,
					fit: "contain",
				})
				.output({ format: "image/webp" });

			const thumbnailImage = await thumbnailImageResult;
			const thumbnailResponse = thumbnailImage.response();
			const thumbnailArrayBuffer = await thumbnailResponse.arrayBuffer();

			await c.env.r2Bucket.put(thumbnailKey, thumbnailArrayBuffer, {
				httpMetadata: { contentType: "image/webp" },
			});

			thumbnailUrl = `${R2_PUBLIC_URL}/${thumbnailKey}`;
		}

		const durationMs = Date.now() - startTime;
		log.info("upload.success", {
			key: carouselKey,
			isPrimary,
			durationMs,
		});

		const response: {
			message: string;
			url: string;
			thumbnailUrl?: string;
			key: string;
		} = {
			message: "Uploaded successfully",
			url: carouselUrl,
			key: carouselKey,
		};

		if (thumbnailUrl) {
			response.thumbnailUrl = thumbnailUrl;
		}

		return c.json(response);
	} catch (e) {
		log.error("upload.failed", e);
		return c.json({ status: "ERROR", message: "Failed to upload image" }, 500);
	}
});

// POST /upload/brands
app.post("/brands", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "admin" });
	const log = createLogger(logContext);

	try {
		const formData = await c.req.formData();
		const image = formData.get("image") as unknown as File;
		const brandName = formData.get("brandName") as string;
		const isSvg = image.type === "image/svg+xml";

		const sanitizedBrandName = brandName
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "");

		if (isSvg) {
			const svgArrayBuffer = await image.arrayBuffer();
			await c.env.r2Bucket.put(
				`brands/${sanitizedBrandName}.svg`,
				svgArrayBuffer,
				{ httpMetadata: { contentType: "image/svg+xml" } },
			);

			log.info("upload.brand_success", {
				brandName: sanitizedBrandName,
				format: "svg",
			});

			return c.json({
				url: `${CDN_BASE_URL}/brands/${sanitizedBrandName}.svg`,
				message: "Brand image uploaded successfully",
			});
		}

		const imageStream = image.stream();
		const imageResult = c.env.images
			.input(imageStream)
			.transform({
				width: 800,
				height: 800,
				fit: "contain",
			})
			.output({ format: "image/webp" });
		const brandImage = await imageResult;
		const brandImageResponse = brandImage.response();
		const brandImageArrayBuffer = await brandImageResponse.arrayBuffer();

		await c.env.r2Bucket.put(
			`brands/${sanitizedBrandName}.webp`,
			brandImageArrayBuffer,
			{ httpMetadata: { contentType: "image/webp" } },
		);

		log.info("upload.brand_success", {
			brandName: sanitizedBrandName,
			format: "webp",
		});

		return c.json({
			url: `${CDN_BASE_URL}/brands/${sanitizedBrandName}.webp`,
			message: "Brand image uploaded successfully",
		});
	} catch (e) {
		log.error("upload.brand_failed", e);
		return c.json(
			{ status: "ERROR", message: "Failed to upload brand image" },
			500,
		);
	}
});

// POST /upload/images/urls (batch URL upload)
app.post("/images/urls", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "admin" });
	const log = createLogger(logContext);
	const startTime = Date.now();

	try {
		const body = (await c.req.json()) as ImageUrlArray;

		if (!Array.isArray(body) || body.length === 0) {
			log.warn("upload.urls_validation_failed", { reason: "empty_array" });
			return c.json({ message: "Array of image URLs required" }, 400);
		}

		if (body.length > MAX_URL_IMAGES) {
			log.warn("upload.urls_validation_failed", {
				reason: "too_many",
				count: body.length,
			});
			return c.json(
				{ message: `Maximum ${MAX_URL_IMAGES} images allowed` },
				400,
			);
		}

		const uploadedImages: { url: string }[] = [];

		for (let i = 0; i < body.length; i++) {
			const { url } = body[i];
			const isPrimary = i === 0;

			try {
				const imageResponse = await fetch(url, {
					headers: {
						"User-Agent":
							"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
						Accept: "image/*",
					},
				});

				if (!imageResponse.ok) {
					log.warn("upload.url_fetch_failed", {
						url,
						status: imageResponse.status,
					});
					uploadedImages.push({ url });
					continue;
				}

				const contentType = imageResponse.headers.get("content-type");
				if (!contentType?.startsWith("image/")) {
					log.warn("upload.url_invalid_type", { url, contentType });
					uploadedImages.push({ url });
					continue;
				}

				const generatedId = nanoid();
				const carouselKey = `products/ai-extracted/${generatedId}.webp`;

				const imageArrayBuffer = await imageResponse.arrayBuffer();
				const imageBlob = new Blob([imageArrayBuffer], { type: contentType });

				const carouselImageResult = c.env.images
					.input(imageBlob.stream())
					.transform({
						width: 800,
						height: 600,
						fit: "contain",
					})
					.output({ format: "image/webp" });

				const carouselImage = await carouselImageResult;
				const carouselResponse = carouselImage.response();
				const carouselArrayBuffer = await carouselResponse.arrayBuffer();

				await c.env.r2Bucket.put(carouselKey, carouselArrayBuffer, {
					httpMetadata: { contentType: "image/webp" },
				});

				const carouselUrl = `${CDN_BASE_URL}/${carouselKey}`;

				if (isPrimary) {
					const thumbnailKey = `products/ai-extracted/${generatedId}-thumbnail.webp`;
					const thumbnailBlob = new Blob([imageArrayBuffer], {
						type: contentType,
					});

					const thumbnailImageResult = c.env.images
						.input(thumbnailBlob.stream())
						.transform({
							width: 400,
							height: 300,
							fit: "contain",
						})
						.output({ format: "image/webp" });

					const thumbnailImage = await thumbnailImageResult;
					const thumbnailResponse = thumbnailImage.response();
					const thumbnailArrayBuffer = await thumbnailResponse.arrayBuffer();

					await c.env.r2Bucket.put(thumbnailKey, thumbnailArrayBuffer, {
						httpMetadata: { contentType: "image/webp" },
					});
				}

				uploadedImages.push({ url: carouselUrl });
			} catch (imageError) {
				log.error("upload.url_processing_failed", imageError, { url });
				uploadedImages.push({ url });
			}
		}

		const elapsed = Date.now() - startTime;
		log.info("upload.urls_batch_complete", {
			total: body.length,
			uploaded: uploadedImages.length,
			durationMs: elapsed,
		});

		return c.json({
			images: uploadedImages,
			status: "OK",
			time: elapsed,
		});
	} catch (e) {
		log.error("upload.urls_batch_failed", e);
		return c.json(
			{ status: "ERROR", message: "Failed to upload images from URLs" },
			500,
		);
	}
});

export default app;
