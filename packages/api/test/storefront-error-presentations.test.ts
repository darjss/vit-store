import { describe, expect, test } from "bun:test";
import type { AuthError, ProductError, RestockError } from "@vit/shared";
import {
	presentAuthError,
	presentProductError,
	presentRestockError,
} from "../../../apps/storev2/src/lib/error-presentations";

const authErrors: AuthError[] = [
	{ _tag: "OtpSendRateLimited", retryAfterSeconds: 30 },
	{ _tag: "OtpAttemptRateLimited", retryAfterSeconds: 45 },
	{ _tag: "OtpInvalidOrExpired" },
	{ _tag: "OtpDeliveryUnavailable", retryable: true },
	{ _tag: "PhoneVerificationRequired" },
	{ _tag: "SessionExpired" },
];

const productErrors: ProductError[] = [
	{ _tag: "ProductNotFound" },
	{ _tag: "ProductUnavailable" },
	{ _tag: "InsufficientStock", requested: 4, available: 1 },
	{ _tag: "SearchUnavailable", retryable: true },
];

const restockErrors: RestockError[] = [
	{ _tag: "InvalidContact", channel: "sms" },
	{ _tag: "ContactNotVerified" },
	{ _tag: "SubscriptionLimitReached" },
	{ _tag: "RestockRateLimited", retryAfterSeconds: 60 },
	{ _tag: "ProductNotFound" },
	{ _tag: "ProductAlreadyInStock" },
];

const assertSafePresentation = (presentation: {
	title: string;
	description: string;
	actions: readonly { label: string }[];
}) => {
	expect(presentation.title.length).toBeGreaterThan(0);
	expect(presentation.description.length).toBeGreaterThan(0);
	expect(presentation.actions.length).toBeGreaterThan(0);
	const rendered = JSON.stringify(presentation).toLowerCase();
	for (const technicalText of [
		"error:",
		"stack",
		"cause",
		"token",
		"internal_server_error",
	]) {
		expect(rendered).not.toContain(technicalText);
	}
};

describe("storefront expected-error presentations", () => {
	test("maps every auth error to safe recovery copy", () => {
		for (const error of authErrors) {
			assertSafePresentation(presentAuthError(error));
		}
	});

	test("maps every product error to safe recovery copy", () => {
		for (const error of productErrors) {
			assertSafePresentation(presentProductError(error));
		}
	});

	test("maps every restock error to safe recovery copy", () => {
		for (const error of restockErrors) {
			assertSafePresentation(presentRestockError(error));
		}
	});
});
