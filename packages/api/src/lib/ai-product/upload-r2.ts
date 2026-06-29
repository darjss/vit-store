import type { Context } from "~/lib/context";
import {
	CDN_BASE_URL,
	PRODUCT_IMAGE_UPLOAD_PREFIX,
} from "~/lib/ai-product/constants";
import { logger } from "~/lib/logger";

export async function uploadImagesToR2(
	imageUrls: string[],
	ctx: Context,
): Promise<{ url: string }[]> {
	const uploadedImages: { url: string }[] = [];
	const skippedImages: { url: string; reason: string }[] = [];

	for (const sourceUrl of imageUrls) {
		try {
			const response = await fetch(sourceUrl, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
					Accept: "image/*",
				},
				signal: AbortSignal.timeout(15000),
			});

			if (!response.ok) {
				skippedImages.push({
					url: sourceUrl,
					reason: `fetch_status_${response.status}`,
				});
				continue;
			}

			const contentType = response.headers.get("content-type") || "";
			if (!contentType.startsWith("image/")) {
				skippedImages.push({
					url: sourceUrl,
					reason: "invalid_content_type",
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
			const generatedId = crypto.randomUUID().replace(/-/g, "");
			let key = `${PRODUCT_IMAGE_UPLOAD_PREFIX}/${generatedId}.webp`;

			const imageArrayBuffer = await response.arrayBuffer();
			const imageBlob = new Blob([imageArrayBuffer], { type: contentType });

			try {
				const transformed = await ctx.c.env.images
					.input(imageBlob.stream())
					.transform({
						width: 800,
						height: 600,
						fit: "contain",
					})
					.output({ format: "image/webp" });

				const transformedBuffer = await transformed.response().arrayBuffer();
				await ctx.c.env.r2Bucket.put(key, transformedBuffer, {
					httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" },
				});
			} catch {
				key = `${PRODUCT_IMAGE_UPLOAD_PREFIX}/${generatedId}.${rawExt}`;
				await ctx.c.env.r2Bucket.put(key, imageArrayBuffer, {
					httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
				});
			}

			uploadedImages.push({ url: `${CDN_BASE_URL}/${key}` });
		} catch (imageError) {
			skippedImages.push({
				url: sourceUrl,
				reason: imageError instanceof Error ? imageError.message : "unknown",
			});
		}
	}

	logger.info("uploadImagesToR2.done", {
		uploadedCount: uploadedImages.length,
		skippedCount: skippedImages.length,
	});

	return uploadedImages;
}
