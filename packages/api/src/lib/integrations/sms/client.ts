import {
	WeSend,
	WeSendError,
	type SendOptions,
	type SentSms,
	type SmsCarrier,
	type SmsSendParams,
} from "@wesend/node";
import { env } from "cloudflare:workers";
import { logger } from "~/lib/logger";
import { alertSmsProblem } from "./alert";

export type { SentSms, SmsCarrier };
export { WeSendError };

// WeSend bills 80 MNT per part: 155 chars in Latin ASCII, 65 chars in Unicode, max 4 parts.
export const WESEND_LATIN_PART_SIZE = 155;
export const WESEND_MAX_PARTS = 4;

const SMS_REQUEST_TIMEOUT_MS = 10_000;
const LOW_BALANCE_ALERT_CREDITS = 2000;

// Allowed by WeSend's Latin SMS charset; brackets, braces, pipes, tildes, backticks and
// non-ASCII characters (including ₮ and Cyrillic) switch the whole message to 65-char Unicode.
const NON_WESEND_LATIN_RE = /[^A-Za-z0-9 \n!"#$%&'()*+,\-./:;<=>?@_]/g;

const RETRYABLE_ERROR_CODES = new Set([
	"insufficient_credits",
	"provider_failed",
	"rate_limited",
	"recipient_rate_limited",
	"sending_paused",
	"subscription_required",
]);

const AMBIGUOUS_ERROR_CODES = new Set([
	"connection_error",
	"server_error",
	"timeout",
	"unexpected_response",
]);

const ACCOUNT_BLOCKER_CODES = new Set([
	"invalid_api_key",
	"sending_paused",
	"subscription_required",
]);

export interface SendSmsInput {
	idempotencyKey?: string;
	text: string;
	textByCarrier?: Partial<Record<SmsCarrier, string>>;
	to: string;
}

export function isRetryableWeSendError(error: WeSendError): boolean {
	return RETRYABLE_ERROR_CODES.has(error.code);
}

export function isAmbiguousWeSendError(error: WeSendError): boolean {
	return AMBIGUOUS_ERROR_CODES.has(error.code);
}

/**
 * Normalizes text into WeSend's pure Latin SMS alphabet so a stray symbol
 * (like `®`, `–`, curly quotes, or `₮`) never silently doubles/triples SMS cost.
 */
export function sanitizeSmsLatin(text: string): string {
	return text
		.replaceAll(/[‘’]/g, "'")
		.replaceAll(/[“”«»]/g, '"')
		.replaceAll(/[–—]/g, "-")
		.replaceAll("…", "...")
		.replaceAll("₮", "T")
		.replaceAll(NON_WESEND_LATIN_RE, " ")
		.replaceAll(/[ \t]+/g, " ")
		.trim();
}

function getWeSendClient(): WeSend {
	return new WeSend(env.WESEND_API_KEY, {
		timeout: SMS_REQUEST_TIMEOUT_MS,
	});
}

export async function sendSms(input: SendSmsInput): Promise<SentSms> {
	const params: SmsSendParams = {
		text: input.text,
		to: input.to,
	};
	if (input.textByCarrier) {
		params.text_by_carrier = input.textByCarrier;
	}
	const options: SendOptions | undefined = input.idempotencyKey
		? { idempotencyKey: input.idempotencyKey }
		: undefined;

	try {
		const result = await getWeSendClient().sms.send(params, options);
		if (result.encoding === "unicode") {
			logger.warn("sms.unicode_encoding", {
				nonLatinCharacters: result.non_latin_characters,
				parts: result.parts,
				smsId: result.id,
			});
		}
		if (!result.sandbox && result.balance <= LOW_BALANCE_ALERT_CREDITS) {
			await alertSmsProblem({ balance: result.balance, kind: "low_balance" });
		}
		return result;
	} catch (error) {
		if (error instanceof WeSendError) {
			if (error.code === "insufficient_credits") {
				await alertSmsProblem({
					balance: error.balance,
					kind: "insufficient_credits",
					required: error.required,
				});
			} else if (ACCOUNT_BLOCKER_CODES.has(error.code)) {
				await alertSmsProblem({ code: error.code, kind: "account_blocked" });
			}
		}
		throw error;
	}
}
