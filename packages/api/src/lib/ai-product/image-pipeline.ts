import type { VisionAnalysisResult } from "@vit/shared";
import { isLikelyJunkImage, normalizedImageKey, uniqueStable } from "~/lib/ai-product/amazon-html";
import { visionAnalysisSchema } from "~/lib/ai-product/schemas";
import { type ProductAi, runProductAi } from "~/lib/ai-product/workers-ai";
import { thrownErrorWireSchema } from "~/lib/logging";
import { logger } from "~/lib/logger";
import * as v from "valibot";

type FilteredProductImages = {
	images: Array<string>;
};

export function filterProductImages(imageUrls: Array<string>): FilteredProductImages {
	return {
		images: uniqueStable(
			imageUrls.filter((url) => !isLikelyJunkImage(url)),
			normalizedImageKey,
		).slice(0, 8),
	};
}

export async function analyzeProductImages(
	ai: ProductAi,
	imageUrls: Array<string>,
): Promise<VisionAnalysisResult> {
	const imagesToAnalyze = imageUrls.slice(0, 4);

	if (imagesToAnalyze.length === 0) {
		return {
			dailyIntake: null,
			ingredients: [],
			servingSize: null,
			supplementFacts: null,
		};
	}

	try {
		const output = await runProductAi(ai, {
			imageUrls: imagesToAnalyze,
			maxCompletionTokens: 1536,
			name: "supplement_facts",
			prompt: `Read these images from one Amazon supplement listing. Extract only text that is visible in the images.

Return:
1. Every ingredient from the Supplement Facts label with its amount and % Daily Value
2. Serving size
3. Daily intake as a number of units per day
4. The raw Supplement Facts text

Format each ingredient as "Ingredient Name - Amount (% Daily Value)".
Do not infer missing facts. Use empty or null values when the label is not readable.`,
			schema: visionAnalysisSchema,
		});

		return {
			dailyIntake: output.dailyIntake,
			ingredients: output.ingredients,
			servingSize: output.servingSize,
			supplementFacts: output.supplementFacts,
		};
	} catch (error) {
		logger.error("analyzeProductImages", v.parse(thrownErrorWireSchema, error));
		return {
			dailyIntake: null,
			ingredients: [],
			servingSize: null,
			supplementFacts: null,
		};
	}
}
