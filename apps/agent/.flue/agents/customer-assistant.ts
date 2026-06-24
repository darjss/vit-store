import {
	defineAgent,
	defineAgentProfile,
	type AgentRouteHandler,
} from "@flue/runtime";
import {
	CUSTOMER_ASSISTANT_MODEL,
	customerAssistantInstructions,
	customerAssistantTools,
} from "@vit/assistant";

export const description = "Vit Store customer-facing Messenger assistant tracer bullet.";

export const route: AgentRouteHandler = async (_c, next) => next();

const customerAssistantProfile = defineAgentProfile({
	model: CUSTOMER_ASSISTANT_MODEL,
	instructions: customerAssistantInstructions,
	tools: customerAssistantTools,
});

export default defineAgent(() => ({ profile: customerAssistantProfile }));
