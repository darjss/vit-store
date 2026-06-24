import { defineAgent } from "@flue/runtime";
import {
	CUSTOMER_ASSISTANT_MODEL,
	customerAssistantInstructions,
	customerAssistantTools,
} from "@vit/assistant";
import { channel, postMessage } from "../channels/messenger";

export default defineAgent(({ id }) => ({
	model: CUSTOMER_ASSISTANT_MODEL,
	instructions: customerAssistantInstructions,
	tools: [
		...customerAssistantTools,
		postMessage(channel.parseConversationKey(id)),
	],
}));
