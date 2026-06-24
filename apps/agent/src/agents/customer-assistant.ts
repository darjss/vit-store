import { defineAgent } from "@flue/runtime";
import {
	buildCartTools,
	buildCheckoutTools,
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
import { searchAssistantProducts } from "../lib/catalog";
import { createOrder, fetchDeliveryZones } from "../lib/order";

type AgentEnv = {
	CART_STORE?: DurableObjectNamespace;
	CHECKOUT_STORE?: DurableObjectNamespace;
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
	return {
		model: CUSTOMER_ASSISTANT_MODEL,
		instructions: customerAssistantInstructions,
		tools: [
			buildProductSearchTool({
				searchProducts: searchAssistantProducts,
				sendProductCards: sendProductCards(conversation),
				sendText: sendTextReply(conversation),
			}),
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
