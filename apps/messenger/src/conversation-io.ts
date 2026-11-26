import type { ConversationStore } from "./conversation-store";
import type { Env } from "./env";
import { log } from "./log";
import { sendCards } from "./render";
import type { AdProduct } from "./tools";
import { send, type ZernioSendBody } from "./zernio";

// Single shared IO surface passed into checkout & payment modules. Replaces
// duplicate per-coordinator callback bags and parses thread ids once.
export type ConversationIO = {
	accountId: string;
	adProducts(): Promise<Array<AdProduct>>;
	conversationId: string;
	customerName(): string | undefined;
	ensurePaymentWatch(paymentNumber: string): Promise<void>;
	env: Env;
	handoffToAdmin(reason: string, sendKey: string, extraLines?: Array<string>): Promise<void>;
	markAdPivoted(): void;
	sendCards(ids: Array<number>, key: string): Promise<boolean>;
	sendPart(key: string, body: Omit<ZernioSendBody, "accountId">): Promise<void>;
	store: ConversationStore;
	tapLog(kind: string, outcome: string, paymentNumber?: string): void;
	thread: string;
	triggerOrderDispatch(orderNumber: string): void;
};

export const parseThreadId = (thread: string) => {
	const prefix = "zernio:";
	const split = thread.indexOf(":", prefix.length);
	if (!thread.startsWith(prefix) || split === -1) {
		return { accountId: "", conversationId: thread };
	}
	return {
		accountId: thread.slice(prefix.length, split),
		conversationId: thread.slice(split + 1),
	};
};

export const createConversationIO = (opts: {
	adProducts(): Promise<Array<AdProduct>>;
	ensurePaymentWatch(paymentNumber: string): Promise<void>;
	env: Env;
	handoffToAdmin(reason: string, sendKey: string, extraLines?: Array<string>): Promise<void>;
	store: ConversationStore;
	thread: string;
	triggerOrderDispatch(orderNumber: string): void;
}): ConversationIO => {
	const { accountId, conversationId } = parseThreadId(opts.thread);
	return {
		accountId,
		adProducts: opts.adProducts,
		conversationId,
		customerName: () => opts.store.getMeta("customer_name"),
		ensurePaymentWatch: opts.ensurePaymentWatch,
		env: opts.env,
		handoffToAdmin: opts.handoffToAdmin,
		markAdPivoted: () => opts.store.setMeta("ad_pivoted", "1"),
		sendCards: async (ids, key) => {
			if (opts.store.outboxHas(key)) {
				return true;
			}
			const ok = await sendCards({
				accountId,
				conversationId,
				env: opts.env,
				ids,
				key,
			});
			if (ok) {
				opts.store.markOutbox(key);
			}
			return ok;
		},
		sendPart: async (key, body) => {
			if (opts.store.outboxHas(key)) {
				return;
			}
			await send(opts.env, conversationId, { accountId, ...body }, key);
			opts.store.markOutbox(key);
		},
		store: opts.store,
		tapLog: (kind, outcome, paymentNumber) => {
			log({
				event: "tap",
				kind,
				outcome,
				payment_number: paymentNumber,
				thread: opts.thread,
			});
		},
		thread: opts.thread,
		triggerOrderDispatch: opts.triggerOrderDispatch,
	};
};
