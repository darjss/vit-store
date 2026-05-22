import { generateText, Output } from "ai";
import type { VisionAnalysisResult } from "@vit/shared";
import { parseLlmOutput } from "~/lib/ai/llm-output";
import {
	imageSelectionSchema,
	visionAnalysisSchema,
} from "~/lib/ai-product/schemas";
import {
	isLikelyJunkImage,
	normalizedImageKey,
	uniqueStable,
} from "~/lib/ai-product/amazon-html";
import { logger } from "~/lib/logger";
import { opencode } from "~/lib/opencode-provider";

async function selectProductImagesWithGemini(
	productName: string,
	candidates: string[],
): Promise<{ keep: string[]; primary: string | null; usedFallback: boolean }> {
	if (candidates.length <= 1) {
		return {
			keep: candidates,
			primary: candidates[0] ?? null,
			usedFallback: false,
		};
	}

	try {
		const { output: rawOutput } = await generateText({
			model: opencode("kimi-k2.5"),
			output: Output.object({ schema: imageSelectionSchema }),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Product: ${productName}

Filter these images. KEEP images that show:
- Product packaging, bottle, box, container
- Supplement facts label, ingredient list
- Product interior (capsules, tablets, powder, liquid)
- Close-ups of the product itself

REMOVE only:
- Completely unrelated products
- Generic lifestyle/landscape photos with no product
- Brand logos or banners with no product visible
- Exact duplicates (same image URL)

Be lenient - when in doubt, keep the image. Return keepIndices and primaryIndex (best hero shot).`,
						},
						...candidates.map((url) => ({
							type: "image" as const,
							image: url,
						})),
					],
				},
			],
		});
		const output = parseLlmOutput(imageSelectionSchema, rawOutput);

		const keepIndices = Array.from(new Set(output.keepIndices ?? [])).filter(
			(i) => i >= 0 && i < candidates.length,
		);
		const keep = (keepIndices.length > 0 ? keepIndices : [0])
			.map((i) => candidates[i])
			.filter((url): url is string => typeof url === "string")
			.slice(0, 8);
		const primaryCandidate =
			output.primaryIndex != null &&
			output.primaryIndex >= 0 &&
			output.primaryIndex < candidates.length
				? candidates[output.primaryIndex]
				: null;
		const primary =
			typeof primaryCandidate === "string"
				? primaryCandidate
				: (keep[0] ?? null);
		return { keep, primary, usedFallback: false };
	} catch {
		return {
			keep: candidates.slice(0, 8),
			primary: candidates[0] ?? null,
			usedFallback: true,
		};
	}
}

export async function filterProductImages(
	productName: string,
	imageUrls: string[],
): Promise<{ images: string[]; usedGemini: boolean; usedFallback: boolean }> {
	const startTime = Date.now();
	const deJunk = imageUrls.filter((url) => !isLikelyJunkImage(url));
	const deduped = uniqueStable(deJunk, normalizedImageKey);

	if (deduped.length <= 1) {
		return {
			images: deduped.slice(0, 8),
			usedGemini: false,
			usedFallback: false,
		};
	}

	const candidates = deduped.slice(0, 6);
	const picked = await selectProductImagesWithGemini(productName, candidates);
	const uniquePicked = uniqueStable(picked.keep, normalizedImageKey).slice(
		0,
		8,
	);
	const primary = picked.primary;

	if (!primary || uniquePicked.length === 0) {
		logger.info("filterProductImages.done", {
			before: imageUrls.length,
			after: uniquePicked.length,
			usedFallback: picked.usedFallback,
			elapsedMs: Date.now() - startTime,
		});
		return {
			images: uniquePicked,
			usedGemini: true,
			usedFallback: picked.usedFallback,
		};
	}

	const primaryIndex = uniquePicked.findIndex(
		(url) => normalizedImageKey(url) === normalizedImageKey(primary),
	);
	if (primaryIndex > 0) {
		const [head] = uniquePicked.splice(primaryIndex, 1);
		if (head) uniquePicked.unshift(head);
	}

	return {
		images: uniquePicked,
		usedGemini: true,
		usedFallback: picked.usedFallback,
	};
}

export async function analyzeProductImages(
	imageUrls: string[],
): Promise<VisionAnalysisResult> {
	const imagesToAnalyze = imageUrls.slice(0, 4);

	if (imagesToAnalyze.length === 0) {
		return {
			ingredients: [],
			servingSize: null,
			dailyIntake: null,
			supplementFacts: null,
		};
	}

	try {
		const { output: rawOutput } = await generateText({
			model: opencode("kimi-k2.5"),
			output: Output.object({ schema: visionAnalysisSchema }),
			messages: [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Analyze these supplement product images. Extract:
1. ALL ingredients from the Supplement Facts label with amounts and % Daily Value
2. Serving size
3. Daily intake (how many per day)

Format ingredients as: "Ingredient Name - Amount (% Daily Value)"
Example: "Vitamin D3 - 5000 IU (625%)"`,
						},
						...imagesToAnalyze.map((url) => ({
							type: "image" as const,
							image: url,
						})),
					],
				},
			],
		});
		const output = parseLlmOutput(visionAnalysisSchema, rawOutput);

		return {
			ingredients: output.ingredients || [],
			servingSize: output.servingSize || null,
			dailyIntake: output.dailyIntake || null,
			supplementFacts: output.supplementFacts || null,
		};
	} catch (error) {
		logger.error("analyzeProductImages", error);
		return {
			ingredients: [],
			servingSize: null,
			dailyIntake: null,
			supplementFacts: null,
		};
	}
}
