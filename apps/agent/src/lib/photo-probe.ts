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

export async function runPhotoProbe(
	env: PhotoProbeEnv,
	input: PhotoProbeInput,
): Promise<PhotoProbeResult> {
	const ai = env.AI;
	const bucket = env.MESSENGER_INBOUND_BUCKET;
	if (!ai || !bucket) {
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
	if (staged.status === "error") {
		throw new Error("Could not fetch or stage the probe image.");
	}

	// Run the real production tool against the staged R2 key.
	const tool = buildPhotoIdentifyTool({
		loadImage: (key) => loadInboundImage(bucket, key),
		runVision: buildKimiVision(ai),
	});
	const identified = await tool.run({
		input: { imageKey: staged.value.key },
	});
	if (identified.status === "unavailable") {
		throw new Error("Photo identification is unavailable.");
	}

	// Feed the top suggested query into the SAME #19 search + card formatter.
	const usedQuery = identified.queries[0];
	let cards: ProductCard[] = [];
	let matchCount = 0;
	let searchError: string | undefined;
	if (usedQuery) {
		const products = await searchAssistantProducts(usedQuery, input.limit ?? 8);
		if (products.status === "error") {
			searchError = "catalog_unavailable";
		} else {
			matchCount = products.value.length;
			cards = formatProductCards(products.value);
		}
	}

	return {
		key: staged.value.key,
		contentType: staged.value.contentType,
		size: staged.value.size,
		facts: identified.facts,
		queries: identified.queries,
		usedQuery,
		matchCount,
		cards,
		searchError,
	};
}
