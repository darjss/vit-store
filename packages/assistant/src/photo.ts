import { defineTool } from "@flue/runtime";
import { Result, type Result as BetterResult } from "better-result";
import * as v from "valibot";
import { type AiOperationError, aiOperationErrorSchema } from "./errors";

// Channel-neutral product-photo identification domain (ADR 0003). The R2
// fetch/put and the Workers AI binding call are app/channel concerns and are
// injected here as `loadImage` / `runVision`, so this stays platform-neutral
// and unit-testable without a Worker. The tool returns plain facts + suggested
// catalog queries; turning those queries into product cards is the SAME #19
// `search_products` path (the model chains identify -> search), so no catalog
// or card logic is duplicated here.

// Bare Workers AI model id for the binding (`env.AI.run(...)`). The agent's
// chat model is the flue-prefixed `cloudflare/@cf/moonshotai/kimi-k2.6`; the
// binding wants the unprefixed slug. kimi-k2.6 advertises `input: ["text",
// "image"]`, so the same model serves vision.
export const KIMI_VISION_MODEL = "@cf/moonshotai/kimi-k2.6";

export const PHOTO_IDENTIFY_TOOL_NAME = "identify_product_photo";

// Raw bytes of a staged inbound image, read back from the short-lived R2
// object by key. `contentType` feeds the data-url the vision model receives.
export interface InboundImage {
	bytes: Uint8Array;
	contentType: string;
}

export interface PhotoIdentifyResult {
	// Short human-readable description of what the photo shows (brand, product
	// type, dose, language on the label, packaging colour, etc.).
	facts: string;
	// Catalog search strings, most specific first, to feed straight into the
	// #19 `search_products` tool. May be empty when the photo is unreadable.
	queries: string[];
}

// What the model is asked to return. We instruct strict JSON so parsing is
// deterministic; `parsePhotoVision` is still defensive about fenced/wrapped
// output because small vision models drift.
export const PHOTO_IDENTIFY_PROMPT = `You are a product-identification assistant for a Mongolian supplement & vitamin store.
Look at the attached customer photo and identify the supplement/vitamin product it shows.
Reply with ONLY a compact JSON object, no markdown, no prose, in exactly this shape:
{"facts":"<one short sentence: brand, product type, dose/size, and any label text you can read>","queries":["<catalog search term>","<alternate term>"]}
Rules:
- "queries": 1 to 4 short catalog search strings, MOST SPECIFIC FIRST (e.g. brand + product, then product type). Prefer terms a shopper would type. Romanized Latin is fine.
- If the image is not a product or is unreadable, set "facts" to a brief explanation and "queries" to [].
- Never invent a brand you cannot see. Output JSON only.`;

const visionResultSchema = v.object({
	facts: v.string(),
	queries: v.array(v.string()),
});

// Pull a validated `{facts, queries}` object out of the model text. Malformed
// model output stays distinct from a valid unreadable-photo result.
export const parsePhotoVision = (text: string) => {
	const raw = extractJsonObject(text);
	if (raw === undefined) {
		return Result.err<PhotoIdentifyResult, AiOperationError>({
			_tag: "InvalidModelOutput",
		});
	}
	let decoded: unknown;
	try {
		decoded = JSON.parse(raw);
	} catch {
		return Result.err<PhotoIdentifyResult, AiOperationError>({
			_tag: "InvalidModelOutput",
		});
	}
	const parsed = v.safeParse(visionResultSchema, decoded);
	if (!parsed.success || parsed.output.facts.trim().length === 0) {
		return Result.err<PhotoIdentifyResult, AiOperationError>({
			_tag: "InvalidModelOutput",
		});
	}
	return Result.ok<PhotoIdentifyResult, AiOperationError>({
		facts: parsed.output.facts.trim(),
		queries: parsed.output.queries
			.map((query) => query.trim())
			.filter((query) => query.length > 0)
			.slice(0, 4),
	});
};

const extractJsonObject = (text: string) => {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
};

type PhotoIdentifyFailure = Extract<
	AiOperationError,
	| { _tag: "ExtractionFailed" }
	| { _tag: "InvalidSource" }
	| { _tag: "InvalidModelOutput" }
	| { _tag: "NoUsableImages" }
	| { _tag: "ProviderUnavailable" }
>;

export interface PhotoIdentifyToolDeps {
	loadImage: (
		imageKey: string,
	) => Promise<BetterResult<InboundImage, PhotoIdentifyFailure>>;
	runVision: (
		image: InboundImage,
		prompt: string,
	) => Promise<BetterResult<string, PhotoIdentifyFailure>>;
}

export const photoIdentifyToolOutputSchema = v.variant("status", [
	v.strictObject({
		status: v.literal("identified"),
		imageKey: v.string(),
		facts: v.string(),
		queries: v.array(v.string()),
	}),
	v.strictObject({
		status: v.literal("unavailable"),
		imageKey: v.string(),
		error: aiOperationErrorSchema,
	}),
]);

// Builds the photo-identification tool. The model calls this with the R2
// `imageKey` carried in the dispatch input, gets back text facts + suggested
// queries, then calls `search_products` with the best query to render cards —
// the exact same card path as #19 text search.
export const buildPhotoIdentifyTool = (deps: PhotoIdentifyToolDeps) =>
	defineTool({
		name: PHOTO_IDENTIFY_TOOL_NAME,
		description:
			"Identify the product in a customer-sent photo. Call this whenever the dispatch input includes an imageKey (the customer sent a picture instead of text). Pass that imageKey; it returns text facts about the product plus suggested catalog search queries. After calling it, call search_products with the most specific suggested query to show the matching product cards.",
		input: v.object({
			imageKey: v.pipe(v.string(), v.minLength(1)),
		}),
		output: photoIdentifyToolOutputSchema,
		async run({ input }) {
			const image = await deps.loadImage(input.imageKey);
			if (image.status === "error") {
				return {
					status: "unavailable" as const,
					imageKey: input.imageKey,
					error: image.error,
				};
			}
			const vision = await deps.runVision(image.value, PHOTO_IDENTIFY_PROMPT);
			if (vision.status === "error") {
				return {
					status: "unavailable" as const,
					imageKey: input.imageKey,
					error: vision.error,
				};
			}
			const parsed = parsePhotoVision(vision.value);
			if (parsed.status === "error") {
				return {
					status: "unavailable" as const,
					imageKey: input.imageKey,
					error: parsed.error,
				};
			}
			return {
				status: "identified" as const,
				imageKey: input.imageKey,
				facts: parsed.value.facts,
				queries: parsed.value.queries,
			};
		},
	});
