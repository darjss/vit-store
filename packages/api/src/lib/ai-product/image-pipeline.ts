import type { VisionAnalysisResult } from "@vit/shared";
import {
	isLikelyJunkImage,
	normalizedImageKey,
	uniqueStable,
} from "~/lib/ai-product/amazon-html";
import { visionAnalysisSchema } from "~/lib/ai-product/schemas";
import { type ProductAi, runProductAi } from "~/lib/ai-product/workers-ai";
import { logger } from "~/lib/logger";

export function filterProductImages(imageUrls: string[]): { images: string[] } {
	return {
		images: uniqueStable(
			imageUrls.filter((url) => !isLikelyJunkImage(url)),
			normalizedImageKey,
		).slice(0, 8),
	};
}

export async function analyzeProductImages(
	ai: ProductAi,
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
		const output = await runProductAi(ai, {
			name: "supplement_facts",
			schema: visionAnalysisSchema,
			imageUrls: imagesToAnalyze,
			maxCompletionTokens: 1536,
			prompt: `Read these images from one Amazon supplement listing. Extract only text that is visible in the images.

Return:
1. Every ingredient from the Supplement Facts label with its amount and % Daily Value
2. Serving size
3. Daily intake as a number of units per day
4. The raw Supplement Facts text

Format each ingredient as "Ingredient Name - Amount (% Daily Value)".
Do not infer missing facts. Use empty or null values when the label is not readable.`,
		});

		return {
			ingredients: output.ingredients,
			servingSize: output.servingSize,
			dailyIntake: output.dailyIntake,
			supplementFacts: output.supplementFacts,
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
