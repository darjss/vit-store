import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { config as loadDotEnv } from "dotenv";
import { z } from "zod";

loadDotEnv({ path: ".env" });

type ExtractedProduct = {
	brandName: string;
	productName: string;
	price: number | null;
	priceText: string | null;
	variant: string | null;
	sizeOrCount: string | null;
	sourceImages: string[];
	confidence: number;
};

type ReviewReport = {
	addReview: ExtractedProduct[];
};

const reviewPath = path.resolve(
	process.argv[2] ??
		"vit/2026_05_27__14_49_30/attachments/.vit-ai/reports/normalized-after-update-2/review/manual-candidates.normalized.json",
);
const sourceDir = path.resolve(
	process.argv[3] ?? "vit/2026_05_27__14_49_30/attachments",
);
const outputPath = path.resolve(
	process.argv[4] ??
		"vit/2026_05_27__14_49_30/attachments/.vit-ai/reports/normalized-after-update-2/review/low-confidence-gemini-recheck.json",
);

if (!process.env.GEMINI_API_KEY) {
	throw new Error("Missing GEMINI_API_KEY in .env");
}

const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
const review = JSON.parse(await readFile(reviewPath, "utf8")) as ReviewReport;
const targets = review.addReview.filter(
	(product) => product.price === null || product.confidence < 0.95,
);
const imageNames = Array.from(
	new Set(targets.flatMap((product) => product.sourceImages)),
).sort((left, right) => left.localeCompare(right));

const results = [];
for (const imageName of imageNames) {
	const imagePath = path.join(sourceDir, imageName);
	const imageBuffer = await readFile(imagePath);
	const productsForImage = targets.filter((product) =>
		product.sourceImages.includes(imageName),
	);

	const object = await recheckImage({
		imageName,
		imageBuffer,
		mediaType: mediaTypeFor(imageName),
		productsForImage,
	});

	results.push(object);
}

await writeTextAtomic(
	outputPath,
	`${JSON.stringify(
		{
			generatedAt: new Date().toISOString(),
			reviewPath,
			sourceDir,
			targetProducts: targets.length,
			images: imageNames.length,
			results,
		},
		null,
		2,
	)}\n`,
);

console.log(
	JSON.stringify(
		{
			targetProducts: targets.length,
			images: imageNames.length,
			outputPath,
		},
		null,
		2,
	),
);

function mediaTypeFor(fileName: string): "image/jpeg" | "image/png" | "image/webp" {
	const extension = path.extname(fileName).toLowerCase();
	if (extension === ".png") return "image/png";
	if (extension === ".webp") return "image/webp";
	return "image/jpeg";
}

async function recheckImage(input: {
	imageName: string;
	imageBuffer: Buffer;
	mediaType: "image/jpeg" | "image/png" | "image/webp";
	productsForImage: ExtractedProduct[];
}) {
	let lastError: unknown = null;
	for (const modelName of candidateGeminiModels("gemini-3.0-flash")) {
		try {
			const { object } = await generateObject({
				model: google(modelName),
				schema: z.object({
					imageName: z.string(),
					recheckedProducts: z.array(
						z.object({
							originalName: z.string(),
							brandName: z.string().nullable(),
							productName: z.string().nullable(),
							priceText: z.string().nullable(),
							priceValue: z.number().int().positive().nullable(),
							sizeOrCount: z.string().nullable(),
							shouldAdd: z.boolean(),
							confidence: z.number().min(0).max(1),
							notes: z.string(),
						}),
					),
				}),
				schemaName: "vit_low_confidence_recheck",
				system:
					"You recheck supplement product collage images. Use only visible label and black overlaid price text. Do not guess hidden text. Mark shouldAdd false if the product is unclear, a duplicate mention, a non-supplement accessory, or missing enough catalog data.",
				messages: [
					{
						role: "user",
						content: [
							{
								type: "text",
								text: [
									`Image file: ${input.imageName}`,
									"Recheck these previously uncertain extracted products:",
									...input.productsForImage.map(
										(product) =>
											`- ${product.brandName} ${product.productName} ${product.variant ?? ""} ${product.sizeOrCount ?? ""}; previous price=${product.priceText ?? product.price ?? "null"}; confidence=${product.confidence}`,
									),
									"Return corrected brand, product, size/count, price, whether it should be added as a catalog product, and a short note.",
								].join("\n"),
							},
							{
								type: "image",
								image: input.imageBuffer,
								mediaType: input.mediaType,
							},
						],
					},
				],
			});
			return object;
		} catch (error) {
			lastError = error;
		}
	}

	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function candidateGeminiModels(requestedModel: string): string[] {
	if (requestedModel !== "gemini-3.0-flash") return [requestedModel];
	return ["gemini-3.0-flash", "gemini-3-flash-preview", "gemini-3.5-flash"];
}

async function writeTextAtomic(filePath: string, text: string): Promise<void> {
	const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
	await writeFile(tempPath, text, "utf8");
	await rename(tempPath, filePath);
}
