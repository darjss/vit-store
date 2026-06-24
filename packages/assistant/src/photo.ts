import { defineTool } from "@flue/runtime";
import * as v from "valibot";

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

// Pull the `{facts, queries}` object out of the model's text. Tolerant of code
// fences and surrounding prose by extracting the first balanced JSON object.
// Falls back to treating the whole reply as the facts (with no queries) so a
// non-JSON answer still degrades to a usable, non-throwing result.
export const parsePhotoVision = (text: string): PhotoIdentifyResult => {
	const raw = extractJsonObject(text);
	if (raw !== undefined) {
		try {
			const parsed = v.parse(visionResultSchema, JSON.parse(raw));
			const queries = parsed.queries
				.map((q) => q.trim())
				.filter((q) => q.length > 0)
				.slice(0, 4);
			return { facts: parsed.facts.trim(), queries };
		} catch {
			// fall through to the soft fallback below
		}
	}
	const facts = text.trim();
	return { facts: facts.length > 0 ? facts : "No description returned.", queries: [] };
};

const extractJsonObject = (text: string): string | undefined => {
	const start = text.indexOf("{");
	if (start === -1) return undefined;
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i += 1) {
		const ch = text[i];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === '"') inString = false;
			continue;
		}
		if (ch === '"') inString = true;
		else if (ch === "{") depth += 1;
		else if (ch === "}") {
			depth -= 1;
			if (depth === 0) return text.slice(start, i + 1);
		}
	}
	return undefined;
};

export interface PhotoIdentifyToolDeps {
	// Reads the staged R2 object by key. Returns undefined when the object is
	// missing/expired (lifecycle cleanup) so the tool can tell the model the
	// photo is no longer available instead of throwing the turn out.
	loadImage: (imageKey: string) => Promise<InboundImage | undefined>;
	// Runs the vision model on the image with the given prompt and returns its
	// raw text. Injected by the app (Workers AI binding); see lib/vision.ts.
	runVision: (image: InboundImage, prompt: string) => Promise<string>;
}

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
			imageKey: v.pipe(
				v.string(),
				v.minLength(1),
				v.description(
					"The messenger-inbound/ R2 object key for the customer's photo, taken from the dispatch input's imageKeys.",
				),
			),
		}),
		async run({ input }) {
			const image = await deps.loadImage(input.imageKey);
			if (image === undefined) {
				return {
					imageKey: input.imageKey,
					available: false,
					facts: "The photo is no longer available.",
					queries: [],
				};
			}
			const text = await deps.runVision(image, PHOTO_IDENTIFY_PROMPT);
			const result = parsePhotoVision(text);
			return {
				imageKey: input.imageKey,
				available: true,
				facts: result.facts,
				queries: result.queries,
			};
		},
	});
