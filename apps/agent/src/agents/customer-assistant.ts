import { defineAgent } from "@flue/runtime";
import {
	buildCartTools,
	buildPhotoIdentifyTool,
	buildProductSearchTool,
	CUSTOMER_ASSISTANT_MODEL,
	customerAssistantInstructions,
} from "@vit/assistant";
import { cartSessionFor } from "../channels/cart-session";
import {
	channel,
	postMessage,
	sendCartSummary,
	sendProductCards,
	sendTextReply,
} from "../channels/messenger";
import { searchAssistantProducts } from "../lib/catalog";
import { loadInboundImage } from "../lib/messenger-inbound";
import { buildKimiVision } from "../lib/vision";

type AgentEnv = {
	CART_STORE?: DurableObjectNamespace;
	AI?: Ai;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
};

export default defineAgent<AgentEnv>(({ id, env }) => {
	const conversation = channel.parseConversationKey(id);
	// Same per-session CartStore the deterministic button path writes to, keyed
	// by the assistant session id — so conversational edits and button taps act
	// on one authoritative cart.
	const cart = cartSessionFor(env.CART_STORE, id);
	// Photo identification (#20) needs both the Workers AI binding (Kimi vision,
	// remote-only) and the inbound R2 bucket. Register it additively only when
	// both are bound, so text/cart turns under local miniflare (no env.AI) are
	// unaffected.
	const photoTools =
		env.AI && env.MESSENGER_INBOUND_BUCKET
			? [
					buildPhotoIdentifyTool({
						loadImage: (key) =>
							loadInboundImage(
								env.MESSENGER_INBOUND_BUCKET as R2Bucket,
								key,
							),
						runVision: buildKimiVision(env.AI),
					}),
				]
			: [];
	return {
		model: CUSTOMER_ASSISTANT_MODEL,
		instructions: customerAssistantInstructions,
		tools: [
			buildProductSearchTool({
				searchProducts: searchAssistantProducts,
				sendProductCards: sendProductCards(conversation),
				sendText: sendTextReply(conversation),
			}),
			...photoTools,
			...(cart
				? buildCartTools({
						getCart: cart.getCart,
						applyCommand: cart.applyCommand,
						sendCartSummary: sendCartSummary(conversation),
					})
				: []),
			postMessage(conversation),
		],
	};
});
