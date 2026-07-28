import { describe, expect, test } from "bun:test";
import {
	MessageValidationError,
	MessengerAPIError,
	MessengerNetworkError,
	MessengerTimeoutError,
} from "@warriorteam/messenger-sdk";
import {
	classifyMessengerDeliveryFailure,
	sendMessenger,
} from "../src/lib/messenger-delivery";
import { isAllowedMessengerImageHost } from "../src/lib/messenger-inbound";

const apiError = (statusCode: number) =>
	new MessengerAPIError(
		{
			message: "provider detail",
			type: "OAuthException",
			code: 1,
			fbtrace_id: "trace",
		},
		statusCode,
	);

describe("Messenger delivery adapter", () => {
	test("validates a successful provider receipt", async () => {
		const result = await sendMessenger(async () => ({ message_id: "mid.1" }));
		expect(result.status).toBe("ok");
		if (result.status === "ok") expect(result.value.messageId).toBe("mid.1");
	});

	test("marks a malformed receipt as ambiguous", async () => {
		const result = await sendMessenger(async () => ({ recipient_id: "psid" }));
		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.error).toEqual({
				_tag: "AmbiguousDelivery",
				provider: "messenger",
				code: "malformed_response",
				retryable: false,
			});
		}
	});

	test("distinguishes retryable, ambiguous, permanent, and invalid failures", () => {
		expect(classifyMessengerDeliveryFailure(apiError(429))?._tag).toBe(
			"RetryableDeliveryFailure",
		);
		expect(classifyMessengerDeliveryFailure(apiError(503))?._tag).toBe(
			"AmbiguousDelivery",
		);
		expect(classifyMessengerDeliveryFailure(apiError(400))?._tag).toBe(
			"PermanentDeliveryFailure",
		);
		expect(
			classifyMessengerDeliveryFailure(new MessageValidationError("bad"))?._tag,
		).toBe("InvalidDelivery");
		expect(
			classifyMessengerDeliveryFailure(new MessengerTimeoutError(1000))?._tag,
		).toBe("AmbiguousDelivery");
		expect(
			classifyMessengerDeliveryFailure(
				new MessengerNetworkError("network"),
			)?._tag,
		).toBe("AmbiguousDelivery");
	});

	test("rethrows unknown defects", async () => {
		const defect = new Error("programming defect");
		expect(sendMessenger(async () => Promise.reject(defect))).rejects.toBe(
			defect,
		);
	});

	test("accepts only trusted HTTPS Messenger image hosts", () => {
		expect(
			isAllowedMessengerImageHost("https://scontent.xx.fbcdn.net/image.jpg"),
		).toBe(true);
		expect(
			isAllowedMessengerImageHost("https://cdn.fbsbx.com/image.jpg"),
		).toBe(true);
		expect(
			isAllowedMessengerImageHost("http://scontent.xx.fbcdn.net/image.jpg"),
		).toBe(false);
		expect(
			isAllowedMessengerImageHost("https://fbcdn.net.attacker.example/x"),
		).toBe(false);
	});
});
