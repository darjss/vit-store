import "../lib/observability";
import { defineAgent } from "@flue/runtime";
import {
	ADMIN_ASSISTANT_MODEL,
	adminAssistantInstructions,
	buildAdminQueryTool,
	buildChatOrderImageExtractTool,
	buildPurchaseImageExtractTool,
	serializeCodemodeJson,
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

const buildQueryTools = (env: AgentEnv, storeApiUrl: string) =>
	env.LOADER && env.ADMIN_BOT_TOKEN
		? [buildAdminQueryTool({ botToken: env.ADMIN_BOT_TOKEN, loader: env.LOADER, storeApiUrl })]
		: [];

// Both image tools read staged chat images from R2 and run Workers AI vision.
const buildImageTools = (env: AgentEnv, storeApiUrl: string) => {
	const bucket = env.MESSENGER_INBOUND_BUCKET;
	const adminToken = env.ADMIN_BOT_TOKEN;
	if (!bucket || !env.AI) {
		return [];
	}
	const loadImage = (key: string) => loadInboundImage(bucket, key);
	const runVision = buildKimiVision(env.AI, 4096);
	const chatOrderTool = buildChatOrderImageExtractTool({ loadImage, runVision });
	if (!adminToken) {
		return [chatOrderTool];
	}
	const purchaseTool = buildPurchaseImageExtractTool({
		loadImage,
		matchExtracted: async (input) =>
			serializeCodemodeJson(
				await createAdminBotClient(storeApiUrl, adminToken).aiPurchase.matchExtractedInvoice.mutate(
					input,
				),
			),
		runVision,
	});
	return [purchaseTool, chatOrderTool];
};

const buildReplyTools = (env: AgentEnv, id: string, storeApiUrl: string) => {
	if (!id.startsWith("telegram:")) {
		return [postMessengerMessage(messengerChannel.parseConversationKey(id.replace(/:v\d+$/, "")))];
	}
	const ref = telegramChannel.parseConversationKey(id);
	const replyTool = postTelegramMessage(ref);
	return env.ADMIN_BOT_TOKEN
		? [replyTool, postTelegramProductPhoto({ botToken: env.ADMIN_BOT_TOKEN, ref, storeApiUrl })]
		: [replyTool];
};

export default defineAgent<AgentEnv>(({ env, id }) => {
	const storeApiUrl = process.env.STORE_API_URL ?? "http://localhost:3000";
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
			...buildQueryTools(env, storeApiUrl),
			...buildImageTools(env, storeApiUrl),
			...buildReplyTools(env, id, storeApiUrl),
		],
	};
});
