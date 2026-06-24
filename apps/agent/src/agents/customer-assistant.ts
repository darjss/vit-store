import { defineAgent } from "@flue/runtime";
import {
	buildProductSearchTool,
	CUSTOMER_ASSISTANT_MODEL,
	customerAssistantInstructions,
} from "@vit/assistant";
import {
	channel,
	postMessage,
	sendProductCards,
	sendTextReply,
} from "../channels/messenger";
import { searchAssistantProducts } from "../lib/catalog";

export default defineAgent(({ id }) => {
	const conversation = channel.parseConversationKey(id);
	return {
		model: CUSTOMER_ASSISTANT_MODEL,
		instructions: customerAssistantInstructions,
		tools: [
			buildProductSearchTool({
				searchProducts: searchAssistantProducts,
				sendProductCards: sendProductCards(conversation),
				sendText: sendTextReply(conversation),
			}),
			postMessage(conversation),
		],
	};
});
