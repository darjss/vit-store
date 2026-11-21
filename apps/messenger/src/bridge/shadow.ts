import { createOpenAI } from "@ai-sdk/openai";
import { Agent } from "agents";
import * as v from "valibot";
import { accountIds, type Env, zernioBaseUrl } from "../env";
import { errorFields, log, logError } from "../log";
import { botClient } from "../store";
import {
	type CatalogProduct,
	type ChatMessage,
	type ExtractedOrder,
	extractOrders,
} from "./extract";

const MAX_CHATS_PER_TICK = 8;
const MAX_PHOTOS_PER_CHAT = 16;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CATALOG_TTL_MS = 10 * 60_000;
const INITIAL_LOOKBACK_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 20_000;

const conversationListSchema = v.looseObject({
	data: v.array(
		v.looseObject({
			id: v.string(),
			updatedTime: v.string(),
		}),
	),
});

const messageListSchema = v.looseObject({
	messages: v.array(
		v.looseObject({
			attachments: v.optional(
				v.array(v.looseObject({ type: v.optional(v.string()), url: v.optional(v.string()) })),
			),
			createdAt: v.string(),
			direction: v.picklist(["incoming", "outgoing"]),
			id: v.string(),
			message: v.optional(v.string()),
		}),
	),
});

const detectMediaType = (buf: Uint8Array): string => {
	if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
		return "image/png";
	}
	if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
		return "image/webp";
	}
	if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
		return "image/gif";
	}
	return "image/jpeg";
};

const hashOrders = async (orders: Array<ExtractedOrder>): Promise<string> => {
	const canonical = orders.map((o) => ({
		cancelled: o.cancelled,
		confirmedAtMsg: o.confirmedAtMsg,
		deliveryFee: o.deliveryFee,
		items: o.items.map((i) => ({ productId: i.productId, qty: i.qty })),
		paymentSent: o.paymentSent,
		phone: o.phone,
		pickup: o.pickup,
		quotedTotal: o.quotedTotal,
	}));
	const bytes = new TextEncoder().encode(JSON.stringify(canonical));
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

const summarizeOrder = (o: ExtractedOrder) => ({
	cancelled: o.cancelled,
	confirmedAtMsg: o.confirmedAtMsg,
	deliveryFee: o.deliveryFee,
	itemCount: o.items.length,
	itemIds: o.items.map((i) => i.productId),
	paymentSent: o.paymentSent,
	phoneLast4: o.phone ? o.phone.slice(-4) : null,
	pickup: o.pickup,
	quotedTotal: o.quotedTotal,
});

const createBridgeModel = (env: Env) => {
	const llm = env.LLM;
	const fetcher: typeof fetch | undefined =
		llm === undefined ? undefined : (input, init) => llm.fetch(input, init);
	const modelId = env.BRIDGE_MODEL?.trim() || "gpt-6.1-terra";
	return {
		model: createOpenAI({
			apiKey: env.OPENAI_API_KEY,
			baseURL: env.OPENAI_BASE_URL,
			fetch: fetcher,
		}).chat(modelId),
		modelId,
	};
};

const downloadPhoto = async (
	url: string,
): Promise<{ data: Uint8Array; mediaType: string } | null> => {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
		if (!res.ok) {
			return null;
		}
		const bytes = new Uint8Array(await res.arrayBuffer());
		if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) {
			return null;
		}
		return { data: bytes, mediaType: detectMediaType(bytes) };
	} catch {
		return null;
	}
};

const sendShadowTelegram = async (
	env: Env,
	conversationId: string,
	orders: Array<ExtractedOrder>,
): Promise<void> => {
	if (env.BRIDGE_SHADOW_TELEGRAM !== "true") {
		return;
	}
	const token = env.TELEGRAM_ADMIN_BOT_TOKEN;
	const chatIds = (env.TELEGRAM_ADMIN_CHAT_ID ?? "")
		.split(",")
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
	if (!token || chatIds.length === 0) {
		return;
	}
	const base = (env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/+$/, "");
	const lines = [
		`[bridge shadow] ${conversationId} · ${orders.length} order(s)`,
		...orders.map((o, idx) => {
			const items = o.items.map((i) => `${i.productId ?? "?"}×${i.qty} ${i.label}`).join(", ");
			const flags = [
				o.quotedTotal !== null ? `${o.quotedTotal.toLocaleString()}₮` : "no quote",
				o.paymentSent ? "paid" : "unpaid",
				...(o.pickup ? ["pickup"] : []),
				...(o.cancelled ? ["cancelled"] : []),
			].join(" · ");
			return `#${idx + 1} (${flags}) — ${items}`;
		}),
	];
	await Promise.allSettled(
		chatIds.map((chatId) =>
			fetch(`${base}/bot${encodeURIComponent(token)}/sendMessage`, {
				body: JSON.stringify({ chat_id: chatId, text: lines.join("\n") }),
				headers: { "content-type": "application/json" },
				method: "POST",
				signal: AbortSignal.timeout(10_000),
			}),
		),
	);
};

// Polls the human-answered Facebook page on a 5-minute cron, runs extractOrders
// over changed chats, and logs shadow decisions to Axiom with zero DB writes or
// customer messages. Automatically stops if the page joins ZERNIO_ACCOUNT_IDS.
export class OrderBridge extends Agent<Env> {
	private catalogCache?: { at: number; products: Array<CatalogProduct> };

	onStart() {
		void this.sql`
			CREATE TABLE IF NOT EXISTS bridge_meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			)`;
		void this.sql`
			CREATE TABLE IF NOT EXISTS bridge_chats (
				conversation_id TEXT PRIMARY KEY,
				updated_time TEXT NOT NULL,
				last_msg_id TEXT,
				last_order_hash TEXT,
				last_order_count INTEGER NOT NULL DEFAULT 0,
				updated_at INTEGER NOT NULL
			)`;
	}

	async tick(): Promise<{
		changed: number;
		checked: number;
		errors: number;
		extracted: number;
		skipped?: string;
		watermark?: string;
	}> {
		const startedAt = Date.now();
		const mode = this.env.BRIDGE_MODE?.trim() ?? "off";
		const accountId = this.env.BRIDGE_ACCOUNT_ID?.trim() ?? "";
		if (mode !== "shadow" || !accountId) {
			return { changed: 0, checked: 0, errors: 0, extracted: 0, skipped: "disabled" };
		}
		if (accountIds(this.env).includes(accountId)) {
			log({ event: "bridge_tick", ms: Date.now() - startedAt, skipped: "managed_by_bot" });
			return { changed: 0, checked: 0, errors: 0, extracted: 0, skipped: "managed_by_bot" };
		}

		let watermark = this.getMeta("watermark");
		if (watermark === null) {
			watermark = new Date(Date.now() - INITIAL_LOOKBACK_MS).toISOString();
			this.setMeta("watermark", watermark);
		}
		const watermarkMs = Date.parse(watermark);

		const conversations = await this.listChangedConversations(accountId, watermarkMs);
		let checked = 0;
		let extracted = 0;
		let changed = 0;
		let errors = 0;

		if (conversations.length > 0) {
			const catalog = await this.loadCatalog();
			const { model, modelId } = createBridgeModel(this.env);
			for (const conv of conversations) {
				checked++;
				try {
					const result = await this.processConversation({
						accountId,
						catalog,
						conversationId: conv.id,
						model,
						modelId,
						updatedTime: conv.updatedTime,
					});
					if (result.extracted) {
						extracted++;
					}
					if (result.changed) {
						changed++;
					}
					watermark = conv.updatedTime;
					this.setMeta("watermark", watermark);
				} catch (error) {
					errors++;
					logError({
						error: errorFields(error),
						event: "error",
						thread: `zernio:${accountId}:${conv.id}`,
						where: "order_bridge_tick",
					});
					// Stop advancing watermark past a failed chat so the next tick retries it.
					break;
				}
			}
		}

		log({
			changed,
			checked,
			errors,
			event: "bridge_tick",
			extracted,
			ms: Date.now() - startedAt,
			watermark,
		});
		return { changed, checked, errors, extracted, watermark };
	}

	adminStatus() {
		const [countRow] = this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM bridge_chats`;
		const recent = this.sql<{
			conversation_id: string;
			last_order_count: number;
			updated_at: number;
			updated_time: string;
		}>`
			SELECT conversation_id, last_order_count, updated_at, updated_time
			FROM bridge_chats ORDER BY updated_at DESC LIMIT 20`;
		return {
			accountId: this.env.BRIDGE_ACCOUNT_ID ?? null,
			mode: this.env.BRIDGE_MODE ?? "off",
			model: this.env.BRIDGE_MODEL ?? "gpt-6.1-terra",
			recent,
			trackedChats: countRow?.n ?? 0,
			watermark: this.getMeta("watermark"),
		};
	}

	private getMeta(key: string): string | null {
		const [row] = this.sql<{ value: string }>`SELECT value FROM bridge_meta WHERE key = ${key}`;
		return row?.value ?? null;
	}

	private setMeta(key: string, value: string): void {
		void this.sql`
			INSERT INTO bridge_meta (key, value) VALUES (${key}, ${value})
			ON CONFLICT (key) DO UPDATE SET value = ${value}`;
	}

	private async listChangedConversations(accountId: string, watermarkMs: number) {
		const url = `${zernioBaseUrl(this.env)}/v1/inbox/conversations?accountId=${encodeURIComponent(accountId)}&limit=50`;
		const res = await fetch(url, {
			headers: { authorization: `Bearer ${this.env.ZERNIO_API_KEY}` },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!res.ok) {
			throw new Error(`Zernio list conversations failed: ${res.status}`);
		}
		const parsed = v.parse(conversationListSchema, await res.json());
		return parsed.data
			.filter((c) => Date.parse(c.updatedTime) > watermarkMs)
			.toSorted((a, b) => Date.parse(a.updatedTime) - Date.parse(b.updatedTime))
			.slice(0, MAX_CHATS_PER_TICK);
	}

	private async loadCatalog(): Promise<Array<CatalogProduct>> {
		if (this.catalogCache && Date.now() - this.catalogCache.at < CATALOG_TTL_MS) {
			return this.catalogCache.products;
		}
		const client = botClient(this.env);
		if (!client) {
			throw new Error("ADMIN_BOT_TOKEN is required to load catalog for OrderBridge");
		}
		const [products, brands] = await Promise.all([
			client.product.getAllProducts.query(),
			client.brands.getAllBrands.query(),
		]);
		const brandNameById = new Map(brands.map((b) => [b.id, b.name]));
		const catalog: Array<CatalogProduct> = products.map((p) => ({
			amount: p.amount,
			brand: brandNameById.get(p.brandId) ?? "",
			compare_at_price: p.compareAtPrice,
			id: p.id,
			name: p.name,
			name_mn: p.name_mn,
			potency: p.potency,
			price: p.price,
			status: p.status,
		}));
		this.catalogCache = { at: Date.now(), products: catalog };
		return catalog;
	}

	private async fetchChatMessages(
		accountId: string,
		conversationId: string,
	): Promise<{ latestMsgId: string | null; messages: Array<ChatMessage> }> {
		const url =
			`${zernioBaseUrl(this.env)}/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages` +
			`?accountId=${encodeURIComponent(accountId)}&sortOrder=asc&limit=100`;
		const res = await fetch(url, {
			headers: { authorization: `Bearer ${this.env.ZERNIO_API_KEY}` },
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		});
		if (!res.ok) {
			throw new Error(`Zernio list messages failed: ${res.status}`);
		}
		const parsed = v.parse(messageListSchema, await res.json());
		const sorted = parsed.messages.toSorted(
			(a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
		);
		let photoBudget = MAX_PHOTOS_PER_CHAT;
		const messages: Array<ChatMessage> = [];
		for (const m of sorted) {
			const photos: ChatMessage["photos"] = [];
			for (const a of m.attachments ?? []) {
				if (a.type === "image" && a.url && photoBudget > 0) {
					photoBudget--;
					const photo = await downloadPhoto(a.url);
					if (photo) {
						photos.push(photo);
					}
				}
			}
			messages.push({
				at: m.createdAt,
				direction: m.direction,
				photos,
				text: (m.message ?? "").trim(),
			});
		}
		return { latestMsgId: sorted.at(-1)?.id ?? null, messages };
	}

	private async processConversation(input: {
		accountId: string;
		catalog: Array<CatalogProduct>;
		conversationId: string;
		model: ReturnType<typeof createBridgeModel>["model"];
		modelId: string;
		updatedTime: string;
	}): Promise<{ changed: boolean; extracted: boolean }> {
		const [prev] = this.sql<{
			last_msg_id: string | null;
			last_order_hash: string | null;
		}>`
			SELECT last_msg_id, last_order_hash FROM bridge_chats
			WHERE conversation_id = ${input.conversationId}`;

		const { latestMsgId, messages } = await this.fetchChatMessages(
			input.accountId,
			input.conversationId,
		);
		if (messages.length === 0 || (latestMsgId !== null && prev?.last_msg_id === latestMsgId)) {
			return { changed: false, extracted: false };
		}

		const t0 = Date.now();
		const { orders, usage } = await extractOrders({
			catalog: input.catalog,
			messages,
			model: input.model,
			reasoningEffort: "low",
		});
		const orderHash = await hashOrders(orders);
		const changed = orders.length > 0 && orderHash !== prev?.last_order_hash;
		const now = Date.now();

		void this.sql`
			INSERT INTO bridge_chats (
				conversation_id, updated_time, last_msg_id, last_order_hash, last_order_count, updated_at
			) VALUES (
				${input.conversationId}, ${input.updatedTime}, ${latestMsgId}, ${orderHash}, ${orders.length}, ${now}
			)
			ON CONFLICT (conversation_id) DO UPDATE SET
				updated_time = ${input.updatedTime},
				last_msg_id = ${latestMsgId},
				last_order_hash = ${orderHash},
				last_order_count = ${orders.length},
				updated_at = ${now}`;

		if (changed) {
			log({
				conversation: input.conversationId,
				event: "bridge_shadow",
				messages: messages.length,
				model: input.modelId,
				ms: Date.now() - t0,
				order_summaries: orders.map(summarizeOrder),
				orders: orders.length,
				photos: messages.reduce((sum, m) => sum + m.photos.length, 0),
				tokens_cached: usage.inputTokenDetails?.cacheReadTokens ?? 0,
				tokens_in: usage.inputTokens ?? 0,
				tokens_out: usage.outputTokens ?? 0,
			});
			await sendShadowTelegram(this.env, input.conversationId, orders);
		}
		return { changed, extracted: true };
	}
}
