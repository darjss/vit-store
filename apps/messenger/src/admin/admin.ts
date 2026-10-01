import { generateText, stepCountIs, type ModelMessage, type ToolSet } from "ai";
import { Agent } from "agents";
import * as v from "valibot";
import type { Env } from "../env";
import { createModel, modelName } from "../model";
import { handleTelegramCallback } from "./callbacks";
import { serializeCodemodeJson } from "./codemode-boundary";
import { buildChatOrderImageExtractTool, buildPurchaseImageExtractTool } from "./extract-tools";
import { loadInboundImage } from "./inbound";
import { adminAssistantInstructions } from "./instructions";
import { buildAdminQueryTool } from "./query-tool";
import { createAdminBotClient } from "./admin-bot-client";
import { loadSkillTool, skillsIndex } from "./skills";
import {
	admitSender,
	adminApi,
	postTelegramMessageTool,
	postTelegramProductPhotoTool,
	runWithTyping,
	stageTelegramPhoto,
	telegramUpdateSchema,
	type TelegramMessage,
	type TelegramUpdate,
} from "./telegram";
import { buildVision } from "./vision";

const HISTORY_TURNS = 15;

type MessageRow = {
	content: string;
	role: string;
};

// Durable-queue payload for a model turn; must stay plain JSON.
type QueuedTurn = {
	chatId: number;
	imageKeys: Array<string>;
	text: string;
	typingAction: "typing" | "upload_photo";
	updateId: number;
};

// The Telegram admin bot as a plain Agent Durable Object. One DO per admin
// chat (`telegram:<chatId>`). `seen` dedupes update_id (replaces the old
// MessengerAdmissionStore claims), `claims` dedupes callback actions,
// `messages` keeps whole model turns for history.
export class Admin extends Agent<Env> {
	onStart() {
		void this.sql`CREATE TABLE IF NOT EXISTS seen (update_id INTEGER PRIMARY KEY)`;
		void this.sql`CREATE TABLE IF NOT EXISTS claims (key TEXT PRIMARY KEY, at INTEGER NOT NULL)`;
		void this.sql`
			CREATE TABLE IF NOT EXISTS messages (
				id TEXT PRIMARY KEY,
				turn_id TEXT NOT NULL,
				role TEXT NOT NULL,
				content TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)`;
	}

	async handleUpdate(update: TelegramUpdate): Promise<{ handled: boolean }> {
		const parsed = v.safeParse(telegramUpdateSchema, update);
		if (!parsed.success) {
			return { handled: false };
		}
		const u = parsed.output;
		if (u.callback_query !== undefined) {
			await handleTelegramCallback(
				this.env,
				{
					claimOnce: (key) => this.claimOnce(key),
					enqueueTurn: (text, updateId, chatId) =>
						this.enqueueTurn({ chatId, imageKeys: [], text, typingAction: "typing", updateId }),
				},
				u.callback_query,
				u.update_id,
			);
			return { handled: true };
		}
		if (u.message !== undefined) {
			return { handled: await this.handleMessage(u.message, u.update_id) };
		}
		return { handled: false };
	}

	private async handleMessage(message: TelegramMessage, updateId: number): Promise<boolean> {
		const admitted = await admitSender(this.env, message);
		if (admitted !== "ok") {
			return admitted === "reply";
		}
		return this.dispatchMessage(message, updateId);
	}

	private async dispatchMessage(message: TelegramMessage, updateId: number): Promise<boolean> {
		const text = message.text?.trim() ?? message.caption?.trim() ?? "";
		const hasPhoto = (message.photo?.length ?? 0) > 0;
		if (text === "" && !hasPhoto) {
			return false;
		}
		if (!this.markSeen(updateId)) {
			return true;
		}

		const imageKeys = hasPhoto ? await this.stagePhoto(message) : [];
		if (imageKeys === undefined || (imageKeys.length === 0 && text === "")) {
			return false;
		}

		await this.enqueueTurn({
			chatId: message.chat.id,
			imageKeys,
			text,
			typingAction: hasPhoto ? "upload_photo" : "typing",
			updateId,
		});
		return true;
	}

	// The turn itself is durable-queue work: the webhook returns once the
	// update is admitted, deduped and staged, so Telegram never retries a slow
	// model run.
	private async enqueueTurn(payload: QueuedTurn): Promise<void> {
		await this.queue("runQueuedTurn", payload);
	}

	async runQueuedTurn(payload: QueuedTurn): Promise<void> {
		await runWithTyping(
			this.env,
			payload.chatId,
			() =>
				this.runTurn({
					imageKeys: payload.imageKeys,
					text: payload.text,
					updateId: payload.updateId,
				}),
			payload.typingAction,
		);
	}

	// Undefined means the photo could not be fetched/staged at all — nothing to
	// dispatch. An empty array means the photo was skipped but text may still
	// carry the turn.
	private async stagePhoto(message: TelegramMessage): Promise<Array<string> | undefined> {
		const api = adminApi(this.env);
		if (api === undefined) {
			return undefined;
		}
		const staged = await stageTelegramPhoto({
			api,
			env: this.env,
			message,
			sessionId: this.name,
		});
		if (staged.status === "unavailable") {
			return undefined;
		}
		return staged.status === "staged" ? [staged.key] : [];
	}

	// Whole-turn history: last N turns, tool calls paired with results.
	private historyByTurns(count: number): Array<ModelMessage> {
		const rows = this.sql<MessageRow>`
			SELECT role, content FROM messages
			WHERE turn_id IN (
				SELECT turn_id FROM messages
				GROUP BY turn_id ORDER BY MAX(created_at) DESC LIMIT ${count}
			)
			ORDER BY created_at ASC`;
		// SAFETY: `content` is written only by saveMessages below, which stores
		// JSON.stringify(ModelMessage).
		return rows.map((row) => JSON.parse(row.content) as ModelMessage);
	}

	private saveMessages(turnId: string, messages: Array<ModelMessage>, startAt: number): void {
		messages.forEach((message, i) => {
			void this.sql`
				INSERT OR REPLACE INTO messages (id, turn_id, role, content, created_at)
				VALUES (${`${turnId}:${i}`}, ${turnId}, ${message.role}, ${JSON.stringify(message)}, ${startAt + i})`;
		});
	}

	private markSeen(updateId: number): boolean {
		const exists =
			this.sql<{ update_id: number }>`SELECT update_id FROM seen WHERE update_id = ${updateId}`
				.length > 0;
		if (exists) {
			return false;
		}
		void this.sql`INSERT INTO seen (update_id) VALUES (${updateId})`;
		return true;
	}

	private claimOnce(key: string): boolean {
		const exists =
			this.sql<{ key: string }>`SELECT \`key\` FROM claims WHERE \`key\` = ${key}`.length > 0;
		if (exists) {
			return false;
		}
		void this.sql`INSERT INTO claims (\`key\`, at) VALUES (${key}, ${Date.now()})`;
		return true;
	}

	private chatId(): number {
		// SAFETY: the DO name is minted only as `telegram:<chatId>` by the
		// webhook handler in index.ts.
		return Number(this.name.slice("telegram:".length));
	}

	private buildTools(posted: { did: boolean }, chatId: number): ToolSet {
		const env = this.env;
		const storeApiUrl = env.STORE_API_URL ?? "http://localhost:3000";
		const tools: ToolSet = {
			load_skill: loadSkillTool(),
			post_telegram_message: postTelegramMessageTool(env, chatId, posted),
		};
		if (env.LOADER !== undefined && env.ADMIN_BOT_TOKEN !== undefined) {
			tools.query = buildAdminQueryTool({
				botToken: env.ADMIN_BOT_TOKEN,
				loader: env.LOADER,
				storeApiUrl,
			});
		}
		if (env.ADMIN_BOT_TOKEN !== undefined) {
			tools.post_telegram_product_photo = postTelegramProductPhotoTool(env, chatId, posted);
		}
		const bucket = env.MESSENGER_INBOUND_BUCKET;
		if (bucket !== undefined && env.AI !== undefined) {
			const deps = {
				loadImage: (key: string) => loadInboundImage(bucket, key),
				runVision: buildVision(env.AI, 4096),
			};
			tools.extract_order_from_chat_image_keys = buildChatOrderImageExtractTool(deps);
			if (env.ADMIN_BOT_TOKEN !== undefined) {
				const botToken = env.ADMIN_BOT_TOKEN;
				tools.extract_purchase_from_image_keys = buildPurchaseImageExtractTool({
					...deps,
					matchExtracted: async (input) =>
						serializeCodemodeJson(
							await createAdminBotClient(
								storeApiUrl,
								botToken,
							).aiPurchase.matchExtractedInvoice.mutate(input),
						),
				});
			}
		}
		return tools;
	}

	private async runTurn(input: {
		imageKeys?: Array<string>;
		text: string;
		updateId: number;
	}): Promise<void> {
		const start = Date.now();
		const chatId = this.chatId();
		const turnId = `tg_${input.updateId}`;

		const userText =
			input.imageKeys !== undefined && input.imageKeys.length > 0
				? `${input.text}\n\nimageKeys: ${JSON.stringify(input.imageKeys)}`
				: input.text;
		const userMessage: ModelMessage = {
			content: [{ text: userText, type: "text" }],
			role: "user",
		};

		const posted = { did: false };
		const result = await generateText({
			messages: [...this.historyByTurns(HISTORY_TURNS), userMessage],
			model: createModel(this.env),
			providerOptions: { openai: { reasoningEffort: "medium" } },
			stopWhen: stepCountIs(20),
			system: `${adminAssistantInstructions}\n\n## Available skills\n${skillsIndex()}`,
			tools: this.buildTools(posted, chatId),
		});

		const created = Date.now();
		this.saveMessages(turnId, [userMessage], created);
		this.saveMessages(turnId, result.response.messages, created + 1);

		// Parity guard: a turn that ended in assistant text but never called
		// post_telegram_message would otherwise be silently dropped.
		if (!posted.did && result.text.length > 0) {
			const api = adminApi(this.env);
			if (api !== undefined) {
				await api.sendMessage(chatId, result.text);
			}
		}

		console.log(
			JSON.stringify({
				conversation: this.name,
				event: "admin_turn",
				model: modelName(this.env),
				posted: posted.did,
				steps: result.steps.length,
				tools: result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
				total_ms: Date.now() - start,
			}),
		);
	}
}
