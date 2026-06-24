import { defineAgent } from "@flue/runtime";
import {
	buildCartTools,
	buildCheckoutTools,
	buildPhotoIdentifyTool,
	buildProductAdviceTool,
	buildProductSearchTool,
	CUSTOMER_ASSISTANT_MODEL,
	customerAssistantInstructions,
	rankZoneCandidates,
} from "@vit/assistant";
import { cartSessionFor } from "../channels/cart-session";
import { checkoutSessionFor } from "../channels/checkout-session";
import {
	channel,
	postMessage,
	sendCartSummary,
	sendProductCards,
	sendTextReply,
} from "../channels/messenger";
import { getAdviceProductsByIds, searchAssistantProducts } from "../lib/catalog";
import { loadInboundImage } from "../lib/messenger-inbound";
import { createOrder, fetchDeliveryZones } from "../lib/order";
import { buildKimiVision } from "../lib/vision";

type AgentEnv = {
	CART_STORE?: DurableObjectNamespace;
	CHECKOUT_STORE?: DurableObjectNamespace;
	AI?: Ai;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
};

export default defineAgent<AgentEnv>(({ id, env }) => {
	const conversation = channel.parseConversationKey(id);
	// Same per-session CartStore the deterministic button path writes to, keyed
	// by the assistant session id — so conversational edits and button taps act
	// on one authoritative cart.
	const cart = cartSessionFor(env.CART_STORE, id);
	// Same per-session keying as the cart, so the in-progress checkout shares one
	// authoritative record with the confirmed cart it consumes.
	const checkout = checkoutSessionFor(env.CHECKOUT_STORE, id);
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
			// Advice/comparison (#22): reads real catalog label data so the model
			// can answer "энэ юунд сайн бэ" / "али нь сайн бэ" / ingredients / usage
			// from the same catalog the search tool uses. Channel-neutral; no env
			// gating needed since it only needs the store API the search already
			// depends on.
			buildProductAdviceTool({
				getAdviceProducts: getAdviceProductsByIds,
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
			// Checkout consumes the confirmed cart, so it needs both stores bound.
			...(cart && checkout
				? buildCheckoutTools({
						getCart: cart.getCart,
						getCheckout: checkout.getCheckout,
						saveCheckout: checkout.saveCheckout,
						// No `knowledge` arg by design: the offline alias artifact (#26)
						// is not yet at a confidence threshold (delivery-zones.ts header,
						// ADR 0005), so ranking degrades to zone-NAME token overlap and
						// the suggestion order is best-effort. Safe because the customer
						// always explicitly confirms one candidate — the bot never
						// auto-picks. Pass the mined aliases here once #26 ships.
						resolveZoneCandidates: async (addressText) =>
							rankZoneCandidates(addressText, await fetchDeliveryZones()),
						createOrder,
						sendText: sendTextReply(conversation),
					})
				: []),
			postMessage(conversation),
		],
	};
});
