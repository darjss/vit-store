import type { MessengerParticipantRef } from "@flue/messenger";

export interface MessengerClientOptions {
	pageId: string;
	pageAccessToken: string;
	graphVersion?: string;
	fetch?: typeof globalThis.fetch;
	apiBaseUrl?: string;
}

export interface MessengerSendTextInput {
	to: MessengerParticipantRef;
	text: string;
}

export type MessengerSenderAction = "typing_on" | "typing_off";

export interface MessengerSendResult {
	recipientId: string;
	messageId?: string;
}

export class MessengerClient {
	readonly messages: {
		sendText(input: MessengerSendTextInput): Promise<MessengerSendResult>;
	};

	readonly senderActions: {
		send(
			to: MessengerParticipantRef,
			action: MessengerSenderAction,
		): Promise<{ recipientId: string }>;
	};

	readonly #pageId: string;
	readonly #pageAccessToken: string;
	readonly #graphVersion: string;
	readonly #fetch: typeof globalThis.fetch;
	readonly #apiBaseUrl: string;

	constructor(options: MessengerClientOptions) {
		this.#pageId = required(options.pageId, "pageId");
		this.#pageAccessToken = required(
			options.pageAccessToken,
			"pageAccessToken",
		);
		this.#graphVersion = options.graphVersion ?? "v25.0";
		if (!/^v\d+\.\d+$/.test(this.#graphVersion)) {
			throw new TypeError("Messenger graphVersion must look like v25.0.");
		}
		this.#fetch = options.fetch ?? globalThis.fetch;
		this.#apiBaseUrl = (
			options.apiBaseUrl ?? "https://graph.facebook.com"
		).replace(/\/+$/, "");
		this.messages = {
			sendText: (input) => this.#sendText(input),
		};
		this.senderActions = {
			send: (to, action) => this.#sendAction(to, action),
		};
	}

	async #sendText(input: MessengerSendTextInput): Promise<MessengerSendResult> {
		const payload = await this.#postMessages({
			recipient: recipient(input.to),
			messaging_type: "RESPONSE",
			message: { text: required(input.text, "text") },
		});
		const recipientId = readRequiredString(payload, "recipient_id");
		const messageId = readOptionalString(payload, "message_id");
		return {
			recipientId,
			...(messageId === undefined ? {} : { messageId }),
		};
	}

	async #sendAction(
		to: MessengerParticipantRef,
		action: MessengerSenderAction,
	): Promise<{ recipientId: string }> {
		const payload = await this.#postMessages({
			recipient: recipient(to),
			sender_action: action,
		});
		return { recipientId: readRequiredString(payload, "recipient_id") };
	}

	async #postMessages(
		body: Record<string, unknown>,
	): Promise<Record<string, unknown>> {
		const url = new URL(
			`${this.#apiBaseUrl}/${this.#graphVersion}/${encodeURIComponent(this.#pageId)}/messages`,
		);
		url.searchParams.set("access_token", this.#pageAccessToken);
		const response = await this.#fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		const payload = await readJson(response);
		if (!response.ok) {
			const error = isRecord(payload.error) ? payload.error : undefined;
			const detail =
				error && typeof error.message === "string"
					? error.message
					: `Messenger request failed with status ${response.status}.`;
			throw new Error(detail);
		}
		return payload;
	}
}

function recipient(
	value: MessengerParticipantRef,
): { id: string } | { user_ref: string } {
	return value.type === "page-scoped-id"
		? { id: required(value.id, "recipient.id") }
		: { user_ref: required(value.id, "recipient.userRef") };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
	const value: unknown = await response.json();
	if (!isRecord(value)) {
		throw new Error("Messenger returned an invalid JSON response.");
	}
	return value;
}

function readRequiredString(
	value: Record<string, unknown>,
	key: string,
): string {
	const item = readOptionalString(value, key);
	if (!item) throw new Error(`Messenger response did not include ${key}.`);
	return item;
}

function readOptionalString(
	value: Record<string, unknown>,
	key: string,
): string | undefined {
	const item = value[key];
	return typeof item === "string" && item.length > 0 ? item : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

function required(value: string, field: string): string {
	if (value.length === 0 || value.trim() !== value) {
		throw new TypeError(`Messenger ${field} is required.`);
	}
	return value;
}
