import type { Context } from "~/lib/context";
import { CDN_BASE_URL, PRODUCT_IMAGE_UPLOAD_PREFIX } from "~/lib/ai-product/constants";
import { logger } from "~/lib/logger";

export async function uploadImagesToR2(
	imageUrls: Array<string>,
	ctx: Context,
): Promise<Array<{ url: string }>> {
	const uploadedImages: Array<{ url: string }> = [];
	const skippedImages: Array<{ reason: string; url: string }> = [];

	for (const sourceUrl of imageUrls) {
		try {
			const response = await fetch(sourceUrl, {
				headers: {
					Accept: "image/*",
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				},
				signal: AbortSignal.timeout(15_000),
			});

			if (!response.ok) {
				skippedImages.push({
					reason: `fetch_status_${response.status}`,
					url: sourceUrl,
				});
				continue;
			}

			const contentType = response.headers.get("content-type") || "";
			if (!contentType.startsWith("image/")) {
				skippedImages.push({
					reason: "invalid_content_type",
					url: sourceUrl,
				});
				continue;
			}

			const rawExt = contentType.includes("png")
				? "png"
				: contentType.includes("gif")
					? "gif"
					: contentType.includes("webp")
						? "webp"
						: "jpg";
			const generatedId = crypto.randomUUID().replaceAll("-", "");
			let key = `${PRODUCT_IMAGE_UPLOAD_PREFIX}/${generatedId}.webp`;

			const imageArrayBuffer = await response.arrayBuffer();
			const imageBlob = new Blob([imageArrayBuffer], { type: contentType });

			try {
				const transformed = await ctx.c.env.images
					.input(imageBlob.stream())
					.transform({
						fit: "contain",
						height: 600,
						width: 800,
					})
					.output({ format: "image/webp" });

				const transformedBuffer = await transformed.response().arrayBuffer();
				await ctx.c.env.r2Bucket.put(key, transformedBuffer, {
					httpMetadata: {
						cacheControl: "public, max-age=31536000, immutable",
						contentType: "image/webp",
					},
				});
			} catch {
				key = `${PRODUCT_IMAGE_UPLOAD_PREFIX}/${generatedId}.${rawExt}`;
				await ctx.c.env.r2Bucket.put(key, imageArrayBuffer, {
					httpMetadata: { cacheControl: "public, max-age=31536000, immutable", contentType },
				});
			}

			uploadedImages.push({ url: `${CDN_BASE_URL}/${key}` });
		} catch (imageError) {
			skippedImages.push({
				reason: imageError instanceof Error ? imageError.message : "unknown",
				url: sourceUrl,
			});
		}
	}

	logger.info("uploadImagesToR2.done", {
		skippedCount: skippedImages.length,
		uploadedCount: uploadedImages.length,
	});

	return uploadedImages;
}
