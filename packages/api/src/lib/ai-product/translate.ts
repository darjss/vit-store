import type {
	FirecrawlExtractedProduct,
	TranslationResult,
	VisionAnalysisResult,
} from "@vit/shared";
import { generateText, Output } from "ai";
import { parseLlmOutput } from "~/lib/ai/llm-output";
import { translationSchema } from "~/lib/ai-product/schemas";
import { logger } from "~/lib/logger";
import { opencode } from "~/lib/opencode-provider";

export async function translateAndStructureProduct(
	extractedData: FirecrawlExtractedProduct,
	visionData: VisionAnalysisResult,
	brands: { id: number; name: string }[],
	categories: { id: number; name: string }[],
): Promise<TranslationResult | null> {
	const allIngredients = [
		...new Set([...extractedData.ingredients, ...visionData.ingredients]),
	];

	try {
		const brandList = brands.map((b) => `  ID ${b.id}: ${b.name}`).join("\n");
		const categoryList = categories
			.map((c) => `  ID ${c.id}: ${c.name}`)
			.join("\n");

		const { output: rawOutput } = await generateText({
			model: opencode("kimi-k2.5"),
			output: Output.object({ schema: translationSchema }),
			prompt: `You are a product specialist for a Mongolian supplement store. Translate this product for Mongolian customers who search in both Cyrillic and Latin scripts.

PRODUCT: ${extractedData.title}
BRAND: ${extractedData.brand || "Unknown"}

FEATURES:
${extractedData.features.map((f, i) => `${i + 1}. ${f}`).join("\n")}

DESCRIPTION: ${extractedData.description || "N/A"}

INGREDIENTS: ${allIngredients.length > 0 ? allIngredients.join("\n") : "Not found"}

SERVING INFO:
- Size: ${visionData.servingSize || extractedData.servingSize || "Unknown"}
- Per Day: ${visionData.dailyIntake || "Unknown"}
- Per Container: ${extractedData.servingsPerContainer || "Unknown"}

AVAILABLE BRANDS (match the product brand to one of these by ID):
${brandList || "  (no brands available)"}

AVAILABLE CATEGORIES (pick the best matching category by ID):
${categoryList || "  (no categories available)"}

INSTRUCTIONS:
1. name: Clean English product name (no brand). Example: "Berberine 1500mg 240 Veggie Capsules"
2. name_mn: Mongolian Cyrillic name. Example: "Берберин 1500мг 240 Ургамлын Капсул"
3. description: Mongolian Cyrillic description (2-3 sentences about benefits)
4. seoTitle: Mix of Mongolian Cyrillic AND English for SEO. Include brand in both scripts.
5. seoDescription: Mongolian Cyrillic with key English terms mixed in for search visibility.
6. ingredients: Mongolian Cyrillic, keep amounts. Example: "Берберин HCl - 1500мг"
7. Extract amount (e.g. "240 Veggie Capsules") and potency (e.g. "1500mg") from title
8. brandId: Match the product brand "${extractedData.brand || "Unknown"}" to one of the AVAILABLE BRANDS above.
9. categoryId: Based on the product type and ingredients, pick the single best matching category.`,
		});
		const output = parseLlmOutput(translationSchema, rawOutput);

		logger.info("translateAndStructureProduct.done", {
			name: output.name,
			brandId: output.brandId,
			categoryId: output.categoryId,
		});

		return output;
	} catch (error) {
		logger.error("translateAndStructureProduct", error);
		return null;
	}
}
