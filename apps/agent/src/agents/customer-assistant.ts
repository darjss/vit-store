import { defineAgent } from "@flue/runtime";
import {
	buildCartTools,
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

type AgentEnv = { CART_STORE?: DurableObjectNamespace };

export default defineAgent<AgentEnv>(({ id, env }) => {
	const conversation = channel.parseConversationKey(id);
	// Same per-session CartStore the deterministic button path writes to, keyed
	// by the assistant session id — so conversational edits and button taps act
	// on one authoritative cart.
	const cart = cartSessionFor(env.CART_STORE, id);
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
			postMessage(conversation),
		],
	};
});
