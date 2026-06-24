import {
	buildPhotoIdentifyTool,
	formatProductCards,
	type ProductCard,
} from "@vit/assistant";
import { searchAssistantProducts } from "./catalog";
import { loadInboundImage, stageInboundImage } from "./messenger-inbound";
import { buildKimiVision } from "./vision";

// Proof harness for the inbound-photo pipeline, mounted at POST
// /messenger/photo-probe (see .flue/app.ts) and driven by cli/photo-identify.ts.
//
// It runs the SAME units as the production dispatch path — stage the image in
// R2, run the real `identify_product_photo` tool (Kimi vision via the AI
// binding), then feed a suggested query into the SAME #19 catalog search + card
// formatter — and RETURNS the intermediate artifacts (R2 key, vision facts,
// queries, card payloads) so a CLI can inspect them. The production webhook
// path hides those inside the agent session; this surfaces them for live proof.
// It is not on the customer message path and sends nothing to Messenger.

export interface PhotoProbeEnv {
	AI?: Ai;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
}

export interface PhotoProbeInput {
	imageUrl: string;
	sessionId?: string;
	messageId?: string;
	limit?: number;
}

export interface PhotoProbeResult {
	key: string;
	contentType: string;
	size: number;
	facts: string;
	queries: string[];
	usedQuery?: string;
	matchCount: number;
	cards: ProductCard[];
	searchError?: string;
}

type IdentifyOutput = {
	imageKey: string;
	available: boolean;
	facts: string;
	queries: string[];
};

export async function runPhotoProbe(
	env: PhotoProbeEnv,
	input: PhotoProbeInput,
): Promise<PhotoProbeResult> {
	const bucket = env.MESSENGER_INBOUND_BUCKET;
	if (!env.AI || !bucket) {
		throw new Error(
			"photo-probe requires the Workers AI binding (remote) and MESSENGER_INBOUND_BUCKET. Run with real Workers AI (not --local).",
		);
	}

	const sessionId = input.sessionId ?? "messenger:probe:session";
	const messageId = input.messageId ?? "probe-message";
	const staged = await stageInboundImage(
		bucket,
		{ sessionId, messageId, index: 0 },
		input.imageUrl,
	);
	if (staged === undefined) {
		throw new Error(`could not fetch/stage image from ${input.imageUrl}`);
	}

	// Run the REAL production tool against the staged R2 key.
	const tool = buildPhotoIdentifyTool({
		loadImage: (key) => loadInboundImage(bucket, key),
		runVision: buildKimiVision(env.AI),
	});
	const identified = (await tool.run({
		input: { imageKey: staged.key },
	})) as IdentifyOutput;

	// Feed the top suggested query into the SAME #19 search + card formatter.
	const usedQuery = identified.queries[0];
	let cards: ProductCard[] = [];
	let matchCount = 0;
	let searchError: string | undefined;
	if (usedQuery) {
		try {
			const products = await searchAssistantProducts(
				usedQuery,
				input.limit ?? 8,
			);
			matchCount = products.length;
			cards = formatProductCards(products);
		} catch (error) {
			searchError = error instanceof Error ? error.message : String(error);
		}
	}

	return {
		key: staged.key,
		contentType: staged.contentType,
		size: staged.size,
		facts: identified.facts,
		queries: identified.queries,
		usedQuery,
		matchCount,
		cards,
		searchError,
	};
}
