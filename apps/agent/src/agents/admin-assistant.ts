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
} from "../channels/messenger";

// Admin agent env: the Worker Loader binding (Codemode sandbox), the bot token
// (auths the tRPC bot client), plus the existing bindings the channel needs.
type AgentEnv = {
	LOADER?: WorkerLoader;
	ADMIN_BOT_TOKEN?: string;
};

export default defineAgent<AgentEnv>(({ id, env }) => {
	// Strip optional session-version suffix (e.g. ":v2") appended by the webhook
	// to rotate the DO instance. The conversation key must match the canonical
	// messenger:v1:page:...:page-scoped-id:... format for parseConversationKey.
	const conversationKey = id.replace(/:v\d+$/, "");
	const conversation = channel.parseConversationKey(conversationKey);
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
		// Auto-compact conversation history when context grows large.
		// Tool results (order lists, product catalogs) can bloat context;
		// compaction summarizes older turns while keeping recent ones verbatim.
		compaction: {
			reserveTokens: 20_000,
			keepRecentTokens: 8_000,
		},
		tools: [
			...(queryTool ? [queryTool] : []),
			postMessage(conversation),
		],
	};
});
