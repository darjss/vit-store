import "../lib/observability";
import { defineAgent } from "@flue/runtime";
import {
	ADMIN_ASSISTANT_MODEL,
	adminAssistantInstructions,
	buildAdminQueryTool,
} from "@vit/assistant";
import {
	channel,
	postMessage,
	sendTextReply,
} from "../channels/messenger";

// Admin agent env: the Worker Loader binding (Codemode sandbox), the bot token
// (auths the tRPC bot client), plus the existing bindings the channel needs.
type AgentEnv = {
	LOADER?: WorkerLoader;
	ADMIN_BOT_TOKEN?: string;
};

export default defineAgent<AgentEnv>(({ id, env }) => {
	const conversation = channel.parseConversationKey(id);
	const storeApiUrl =
		process.env.STORE_API_URL ?? "http://localhost:3000";
	const queryTool =
		env.LOADER && env.ADMIN_BOT_TOKEN
			? buildAdminQueryTool({
					loader: env.LOADER,
					botToken: env.ADMIN_BOT_TOKEN,
					storeApiUrl,
				})
			: undefined;
	return {
		model: ADMIN_ASSISTANT_MODEL,
		thinkingLevel: "medium" as const,
		instructions: adminAssistantInstructions,
		tools: [
			...(queryTool ? [queryTool] : []),
			postMessage(conversation),
		],
	};
});
