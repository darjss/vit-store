import {
	ambiguousDelivery,
	type DeliveryFailure,
	invalidDelivery,
	permanentDeliveryFailure,
	retryableDeliveryFailure,
} from "@vit/shared";
import { Result } from "better-result";
import {
	MessageValidationError,
	MessengerAPIError,
	MessengerConfigError,
	MessengerNetworkError,
	MessengerTimeoutError,
	TemplateValidationError,
} from "@warriorteam/messenger-sdk";
import * as v from "valibot";

const messengerSendResponseSchema = v.object({
	message_id: v.pipe(v.string(), v.minLength(1)),
});

export type MessengerDeliveryReceipt = {
	messageId: string;
};

export const classifyMessengerDeliveryFailure = (
	error: unknown,
): DeliveryFailure | undefined => {
	if (error instanceof MessengerTimeoutError) {
		return ambiguousDelivery("messenger", "timeout");
	}
	if (error instanceof MessengerNetworkError) {
		return ambiguousDelivery("messenger", "network_failure");
	}
	if (
		error instanceof MessageValidationError ||
		error instanceof TemplateValidationError ||
		error instanceof MessengerConfigError
	) {
		return invalidDelivery("messenger", "invalid_payload");
	}
	if (error instanceof MessengerAPIError) {
		if (error.statusCode === 429) {
			return retryableDeliveryFailure("messenger", "rate_limited");
		}
		if (error.statusCode >= 500) {
			return ambiguousDelivery("messenger", "provider_unavailable");
		}
		if (error.statusCode >= 400 && error.statusCode < 500) {
			return permanentDeliveryFailure("messenger", "provider_rejected");
		}
	}
	return undefined;
};

/** One non-idempotent Graph Send API attempt. This function never retries. */
export const sendMessenger = async (operation: () => Promise<unknown>) => {
	let response: unknown;
	try {
		response = await operation();
	} catch (error) {
		const failure = classifyMessengerDeliveryFailure(error);
		if (failure === undefined) throw error;
		return Result.err<MessengerDeliveryReceipt, DeliveryFailure>(failure);
	}

	const parsed = v.safeParse(messengerSendResponseSchema, response);
	if (!parsed.success) {
		// The request completed but its provider receipt cannot prove acceptance.
		return Result.err<MessengerDeliveryReceipt, DeliveryFailure>(
			ambiguousDelivery("messenger", "malformed_response"),
		);
	}
	return Result.ok<MessengerDeliveryReceipt, DeliveryFailure>({
		messageId: parsed.output.message_id,
	});
};
