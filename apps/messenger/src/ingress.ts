import { createZernioAdapter } from "@zernio/chat-sdk-adapter";
import { Agent, getAgentByName } from "agents";
import { createChatSdkState } from "agents/chat-sdk";
import { Chat, type Message } from "chat";
import { admit } from "./admit";
import type { Conversation } from "./conversation";
import type { InboundItem } from "./conversation";
import type { Env } from "./env";
import { zernioBaseUrl } from "./env";
import { typing } from "./zernio";

// Chat SDK Message -> plain serializable item for the Conversation DO. `raw`
// is the Zernio message object with the envelope's top-level `metadata` merged
// in by the adapter, so taps (postbackPayload) and platformMessageId survive.
const toEvent = (message: Message): InboundItem => ({
	attachments: message.attachments.map((a) => ({ type: a.type, url: a.url })),
	id: message.id,
	raw: message.raw,
	text: message.text,
});

// One shared ingress DO: admits (signature + filters) before Chat SDK, records
// every admitted event in the conversation's inbox, then hands the raw request
// to the Zernio adapter so Chat SDK burst handling runs unchanged.
export class Ingress extends Agent<Env> {
	private bot?: Chat<{ zernio: ReturnType<typeof createZernioAdapter> }>;

	onStart() {
		const zernio = createZernioAdapter({
			apiKey: this.env.ZERNIO_API_KEY,
			baseUrl: zernioBaseUrl(this.env),
			botName: "Америк Витамин",
			webhookSecret: this.env.ZERNIO_WEBHOOK_SECRET,
		});
		const bot = new Chat({
			adapters: { zernio },
			concurrency: {
				debounceMs: 1000,
				maxQueueSize: 30,
				onQueueFull: "drop-newest",
				strategy: "burst",
			},
			state: createChatSdkState(),
			userName: "amerik-vitamin",
		});
		bot.registerSingleton();
		// chat@4.41.0 never stamps `threadId` onto the Message before enqueueing
		// it, and the Zernio adapter leaves it as ""; the burst drain then fails
		// decoding "" back into a thread id. Stamp it on the produced message.
		const baseProcessMessage = bot.processMessage.bind(bot);
		bot.processMessage = (adapter, threadId, messageOrFactory, options) =>
			baseProcessMessage(
				adapter,
				threadId,
				async () => {
					// The adapter passes a factory that awaits parseMessage; other
					// adapters may pass a concrete Message. `raw` exists only on
					// Message, so the `in` check narrows both branches.
					const message = "raw" in messageOrFactory ? messageOrFactory : await messageOrFactory();
					return Object.assign(message, { threadId });
				},
				options,
			);
		bot.onDirectMessage(async (thread, message, _channel, ctx) => {
			const conversation = await this.conversation(thread.id);
			await conversation.process([...(ctx?.skipped ?? []), message].map(toEvent));
		});
		this.bot = bot;

		void this.sql`
			CREATE TABLE IF NOT EXISTS threads (
				thread_id TEXT PRIMARY KEY,
				last_at INTEGER NOT NULL
			)`;
	}

	async onRequest(request: Request): Promise<Response> {
		const bot = this.bot;
		if (bot === undefined) {
			return new Response("not initialized", { status: 503 });
		}
		const raw = await request.text();
		const admission = await admit(request, this.env, raw);
		if (!admission.ok) {
			return admission.response;
		}
		const { conversationId, event, threadId } = admission;

		const conversation = await this.conversation(threadId);
		// Durable commit point: the event is in `inbox` (pending) before Chat
		// SDK sees it, so a crash mid-turn can resume instead of losing it.
		await conversation.noteInbound({ eventId: event.id, payload: event });

		this.ctx.waitUntil(typing(this.env, conversationId, event.account.id));

		void this.sql`
			INSERT INTO threads (thread_id, last_at) VALUES (${threadId}, ${Date.now()})
			ON CONFLICT (thread_id) DO UPDATE SET last_at = ${Date.now()}`;

		const forwarded = new Request(request.url, {
			body: raw,
			headers: request.headers,
			method: request.method,
		});
		return bot.webhooks.zernio(forwarded, {
			waitUntil: (task: Promise<unknown>) => this.ctx.waitUntil(task),
		});
	}

	private conversation(threadId: string) {
		return getAgentByName<Env, Conversation>(this.env.Conversation, threadId);
	}
}
