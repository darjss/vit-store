import "../lib/observability";
import { defineAgent } from "@flue/runtime";
import {
	ADMIN_ASSISTANT_MODEL,
	adminAssistantInstructions,
	buildAdminQueryTool,
	buildPurchaseImageExtractTool,
} from "@vit/assistant";
import { createAdminBotClient } from "../lib/admin-bot-client";
import { loadInboundImage } from "../lib/messenger-inbound";
import { buildKimiVision } from "../lib/vision";
import {
	channel as messengerChannel,
	postMessage as postMessengerMessage,
} from "../channels/messenger";
import {
	channel as telegramChannel,
	postTelegramMessage,
	postTelegramProductPhoto,
} from "../channels/telegram";

type AgentEnv = {
	ADMIN_BOT_TOKEN?: string;
	AI?: Ai;
	LOADER?: WorkerLoader;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
};

export default defineAgent<AgentEnv>(({ env, id }) => {
	const storeApiUrl = process.env.STORE_API_URL ?? "http://localhost:3000";
	const queryTool =
		env.LOADER && env.ADMIN_BOT_TOKEN
			? buildAdminQueryTool({
					botToken: env.ADMIN_BOT_TOKEN,
					loader: env.LOADER,
					storeApiUrl,
				})
			: undefined;

	const purchaseExtractTool =
		env.AI && env.MESSENGER_INBOUND_BUCKET && env.ADMIN_BOT_TOKEN
			? buildPurchaseImageExtractTool({
					loadImage: (key) => loadInboundImage(env.MESSENGER_INBOUND_BUCKET as R2Bucket, key),
					matchExtracted: (input) =>
						createAdminBotClient(
							storeApiUrl,
							env.ADMIN_BOT_TOKEN as string,
						).aiPurchase.matchExtractedInvoice.mutate(input),
					runVision: buildKimiVision(env.AI, 4096),
				})
			: undefined;

	const isTelegram = id.startsWith("telegram:");
	const telegramRef = isTelegram ? telegramChannel.parseConversationKey(id) : undefined;
	const replyTool = isTelegram
		? postTelegramMessage(telegramRef!)
		: postMessengerMessage(messengerChannel.parseConversationKey(id.replace(/:v\d+$/, "")));
	const productPhotoTool =
		isTelegram && telegramRef && env.ADMIN_BOT_TOKEN
			? postTelegramProductPhoto({
					botToken: env.ADMIN_BOT_TOKEN,
					ref: telegramRef,
					storeApiUrl,
				})
			: undefined;

	return {
		compaction: {
			keepRecentTokens: 8000,
			reserveTokens: 20_000,
		},
		instructions: adminAssistantInstructions,
		model: ADMIN_ASSISTANT_MODEL,
		thinkingLevel: "medium" as const,
		tools: [
			...(queryTool ? [queryTool] : []),
			...(purchaseExtractTool ? [purchaseExtractTool] : []),
			replyTool,
			...(productPhotoTool ? [productPhotoTool] : []),
		],
	};
});
