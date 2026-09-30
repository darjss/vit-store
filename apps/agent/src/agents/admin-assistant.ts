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
import invoicePurchase from "../skills/invoice-purchase/SKILL.md" with { type: "skill" };
import lookupOrders from "../skills/lookup-orders/SKILL.md" with { type: "skill" };
import messengerOrder from "../skills/messenger-order/SKILL.md" with { type: "skill" };
import namedZoneShip from "../skills/named-zone-ship/SKILL.md" with { type: "skill" };
import stockPaste from "../skills/stock-paste/SKILL.md" with { type: "skill" };
import storeAnalytics from "../skills/store-analytics/SKILL.md" with { type: "skill" };

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

	const bucket = env.MESSENGER_INBOUND_BUCKET;
	const adminToken = env.ADMIN_BOT_TOKEN;
	const runVision = env.AI ? buildKimiVision(env.AI, 4096) : undefined;
	const loadImage = bucket ? (key: string) => loadInboundImage(bucket, key) : undefined;
	const purchaseExtractTool =
		loadImage && runVision && adminToken
			? buildPurchaseImageExtractTool({
					loadImage,
					matchExtracted: (input) =>
						createAdminBotClient(storeApiUrl, adminToken).aiPurchase.matchExtractedInvoice.mutate(
							input,
						),
					runVision,
				})
			: undefined;

	const chatOrderExtractTool =
		loadImage && runVision ? buildChatOrderImageExtractTool({ loadImage, runVision }) : undefined;

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
		skills: [
			addProduct,
			stockPaste,
			lookupOrders,
			namedZoneShip,
			invoicePurchase,
			storeAnalytics,
			messengerOrder,
		],
		thinkingLevel: "medium" as const,
		tools: [
			...(queryTool ? [queryTool] : []),
			...(purchaseExtractTool ? [purchaseExtractTool] : []),
			...(chatOrderExtractTool ? [chatOrderExtractTool] : []),
			replyTool,
			...(productPhotoTool ? [productPhotoTool] : []),
		],
	};
});
