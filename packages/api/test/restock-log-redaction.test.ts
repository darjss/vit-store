import { describe, expect, test } from "bun:test";
import {
	summarizeTrpcInputForLog,
	summarizeTrpcOutputForLog,
} from "../src/lib/logging";

const privateValues = [
	"99112233",
	"guest@example.com",
	"123456",
	"25b5eab9-e189-4a41-9ad8-132a6eedd31f",
];

function expectNoPrivateValues(value: unknown) {
	const serialized = JSON.stringify(value);
	for (const privateValue of privateValues) {
		expect(serialized).not.toContain(privateValue);
	}
}

describe("restock tRPC log redaction", () => {
	test("redacts guest confirmation request and confirmation inputs", () => {
		expectNoPrivateValues(
			summarizeTrpcInputForLog("product.requestGuestRestockConfirmation", {
				productId: 7283,
				channel: "email",
				contact: "guest@example.com",
			}),
		);
		expectNoPrivateValues(
			summarizeTrpcInputForLog("product.confirmGuestRestockSubscription", {
				challengeId: "25b5eab9-e189-4a41-9ad8-132a6eedd31f",
				code: "123456",
			}),
		);
	});

	test("redacts the challenge ID from request output", () => {
		expectNoPrivateValues(
			summarizeTrpcOutputForLog("product.requestGuestRestockConfirmation", {
				challengeId: "25b5eab9-e189-4a41-9ad8-132a6eedd31f",
				expiresInSeconds: 600,
			}),
		);
	});
});
