import type { MessengerParticipantRef } from "@flue/messenger";
import {
	Messenger,
	type Recipient,
	type SendMessageResponse,
} from "@warriorteam/messenger-sdk";

export interface MessengerClientOptions {
	pageAccessToken: string;
	graphVersion?: string;
	apiBaseUrl?: string;
}

export interface MessengerSendTextInput {
	to: MessengerParticipantRef;
	text: string;
}

export type MessengerSenderAction = "typing_on" | "typing_off";

export type MessengerSendResult = SendMessageResponse;

export class MessengerClient {
	readonly messages: {
		sendText(input: MessengerSendTextInput): Promise<MessengerSendResult>;
	};

	readonly senderActions: {
		send(
			to: MessengerParticipantRef,
			action: MessengerSenderAction,
		): Promise<MessengerSendResult>;
	};

	readonly #messenger: Messenger;

	constructor(options: MessengerClientOptions) {
		this.#messenger = new Messenger({
			accessToken: required(options.pageAccessToken, "pageAccessToken"),
			version: options.graphVersion ?? "v25.0",
			...(options.apiBaseUrl === undefined
				? {}
				: { baseUrl: options.apiBaseUrl }),
		});
		this.messages = {
			sendText: (input) =>
				this.#messenger.send.message({
					recipient: recipient(input.to),
					messaging_type: "RESPONSE",
					message: { text: required(input.text, "text") },
				}),
		};
		this.senderActions = {
			send: (to, action) =>
				this.#messenger.send.message({
					recipient: recipient(to),
					messaging_type: "RESPONSE",
					sender_action: action,
				}),
		};
	}
}

function recipient(value: MessengerParticipantRef): Recipient {
	return value.type === "page-scoped-id"
		? { id: required(value.id, "recipient.id") }
		: { user_ref: required(value.id, "recipient.userRef") };
}

function required(value: string, field: string): string {
	if (value.length === 0 || value.trim() !== value) {
		throw new TypeError(`Messenger ${field} is required.`);
	}
	return value;
}
