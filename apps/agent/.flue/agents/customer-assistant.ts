import type { AgentRouteHandler } from "@flue/runtime";

export const description =
	"Vit Store customer-facing Messenger assistant tracer bullet.";

export const route: AgentRouteHandler = async (_c, next) => next();

// The discovered agent must be the SAME definition object the webhook dispatches
// (dispatch() resolves the target by reference identity against discovered
// agents). Re-export the real agent from src so the running Durable Object is
// the one that binds the per-conversation post_messenger_message reply tool.
export { default } from "../../src/agents/customer-assistant";
