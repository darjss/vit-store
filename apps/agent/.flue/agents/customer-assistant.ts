import type { AgentRouteHandler } from "@flue/runtime";
import customerAssistant from "../../src/agents/customer-assistant";

export const description =
	"Vit Store customer-facing Messenger assistant: text product search and replies.";

export const route: AgentRouteHandler = async (_c, next) => next();

export default customerAssistant;
