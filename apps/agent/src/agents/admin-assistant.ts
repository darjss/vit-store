import "../lib/observability";
import { defineAgent } from "@flue/runtime";
import {
	ADMIN_ASSISTANT_MODEL,
	adminAssistantInstructions,
	buildAdminQueryTool,
	buildChatOrderImageExtractTool,
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
import addProduct from "../skills/add-product/SKILL.md" with { type: "skill" };
import stockPaste from "../skills/stock-paste/SKILL.md" with { type: "skill" };
import lookupOrders from "../skills/lookup-orders/SKILL.md" with { type: "skill" };
import namedZoneShip from "../skills/named-zone-ship/SKILL.md" with { type: "skill" };
import invoicePurchase from "../skills/invoice-purchase/SKILL.md" with { type: "skill" };
import storeAnalytics from "../skills/store-analytics/SKILL.md" with { type: "skill" };
import messengerOrder from "../skills/messenger-order/SKILL.md" with { type: "skill" };

type AgentEnv = {
	LOADER?: WorkerLoader;
	ADMIN_BOT_TOKEN?: string;
	AI?: Ai;
	MESSENGER_INBOUND_BUCKET?: R2Bucket;
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

	const loadImage =
		env.MESSENGER_INBOUND_BUCKET !== undefined
			? (key: string) =>
					loadInboundImage(env.MESSENGER_INBOUND_BUCKET as R2Bucket, key)
			: undefined;
	const runVision =
		env.AI !== undefined ? buildKimiVision(env.AI, 4096) : undefined;

	const purchaseExtractTool =
		loadImage && runVision && env.ADMIN_BOT_TOKEN
			? buildPurchaseImageExtractTool({
					loadImage,
					runVision,
					matchExtracted: (input) =>
						createAdminBotClient(
							storeApiUrl,
							env.ADMIN_BOT_TOKEN as string,
						).aiPurchase.matchExtractedInvoice.mutate(input),
				})
			: undefined;

	const chatOrderExtractTool =
		loadImage && runVision
			? buildChatOrderImageExtractTool({ loadImage, runVision })
			: undefined;

	const isTelegram = id.startsWith("telegram:");
	const telegramRef = isTelegram
		? telegramChannel.parseConversationKey(id)
		: undefined;
	const replyTool = isTelegram
		? postTelegramMessage(telegramRef!)
		: postMessengerMessage(
				messengerChannel.parseConversationKey(id.replace(/:v\d+$/, "")),
			);
	const productPhotoTool =
		isTelegram && telegramRef && env.ADMIN_BOT_TOKEN
			? postTelegramProductPhoto({
					ref: telegramRef,
					storeApiUrl,
					botToken: env.ADMIN_BOT_TOKEN,
				})
			: undefined;

	return {
		model: ADMIN_ASSISTANT_MODEL,
		thinkingLevel: "medium" as const,
		instructions: adminAssistantInstructions,
		skills: [
			addProduct,
			stockPaste,
			lookupOrders,
			namedZoneShip,
			invoicePurchase,
			storeAnalytics,
			messengerOrder,
		],
		compaction: {
			reserveTokens: 20_000,
			keepRecentTokens: 8_000,
		},
		tools: [
			...(queryTool ? [queryTool] : []),
			...(purchaseExtractTool ? [purchaseExtractTool] : []),
			...(chatOrderExtractTool ? [chatOrderExtractTool] : []),
			replyTool,
			...(productPhotoTool ? [productPhotoTool] : []),
		],
	};
});
