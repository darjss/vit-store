import "../lib/observability";
import { defineAgent } from "@flue/runtime";
import {
	ADMIN_ASSISTANT_MODEL,
	adminAssistantInstructions,
	buildAdminQueryTool,
} from "@vit/assistant";
import {
	channel as messengerChannel,
	postMessage as postMessengerMessage,
} from "../channels/messenger";
import {
	channel as telegramChannel,
	postTelegramMessage,
} from "../channels/telegram";

type AgentEnv = {
	LOADER?: WorkerLoader;
	ADMIN_BOT_TOKEN?: string;
};

export default defineAgent<AgentEnv>(({ id, env }) => {
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

	const isTelegram = id.startsWith("telegram:");
	const replyTool = isTelegram
		? postTelegramMessage(telegramChannel.parseConversationKey(id))
		: postMessengerMessage(
				messengerChannel.parseConversationKey(id.replace(/:v\d+$/, "")),
			);

	return {
		model: ADMIN_ASSISTANT_MODEL,
		thinkingLevel: "medium" as const,
		instructions: adminAssistantInstructions,
		compaction: {
			reserveTokens: 20_000,
			keepRecentTokens: 8_000,
		},
		tools: [...(queryTool ? [queryTool] : []), replyTool],
	};
});
