import { describe, expect, test } from "bun:test";
import {
	authErrorSchema,
	deserializeResultOrThrow,
	productErrorSchema,
	restockErrorSchema,
	restockSubscriptionResultSchemas,
	serializeResult,
	type AuthError,
	type ProductError,
	type RestockError,
} from "@vit/shared";
import { Result } from "better-result";
import * as v from "valibot";
import { authErrors } from "../src/errors/factories/auth";
import { productErrors } from "../src/errors/factories/product";
import { restockErrors } from "../src/errors/factories/restock";

const authErrorsUnderTest: AuthError[] = [
	authErrors.otpSendRateLimited(30),
	authErrors.otpAttemptRateLimited(45),
	authErrors.otpInvalidOrExpired(),
	authErrors.otpDeliveryUnavailable(true),
	authErrors.phoneVerificationRequired(),
	authErrors.sessionExpired(),
];

const productErrorsUnderTest: ProductError[] = [
	productErrors.notFound(),
	productErrors.unavailable(),
	productErrors.insufficientStock(3, 1),
	productErrors.searchUnavailable(),
];

const restockErrorsUnderTest: RestockError[] = [
	restockErrors.invalidContact("sms"),
	restockErrors.contactNotVerified(),
	restockErrors.subscriptionLimitReached(),
	restockErrors.rateLimited(60),
	restockErrors.productNotFound(),
	restockErrors.productAlreadyInStock(),
];

describe("storefront public failure contracts", () => {
	test("accepts every auth, product, and restock variant", () => {
		for (const error of authErrorsUnderTest) {
			expect(v.parse(authErrorSchema, error)).toEqual(error);
		}
		for (const error of productErrorsUnderTest) {
			expect(v.parse(productErrorSchema, error)).toEqual(error);
		}
		for (const error of restockErrorsUnderTest) {
			expect(v.parse(restockErrorSchema, error)).toEqual(error);
		}
	});

	test.each([
		{ _tag: "OtpDeliveryUnavailable", retryable: true, stack: "secret" },
		{ _tag: "SearchUnavailable", retryable: true, cause: "secret" },
		{ _tag: "InvalidContact", channel: "sms", token: "secret" },
		{ _tag: "RestockRateLimited", retryAfterSeconds: 0 },
	])("rejects malformed or sensitive public fields", (error) => {
		const schemas = [authErrorSchema, productErrorSchema, restockErrorSchema];
		expect(schemas.some((schema) => v.safeParse(schema, error).success)).toBe(
			false,
		);
	});

	test("round-trips an idempotent restock success and expected failure", () => {
		const success = Result.ok({
			success: true as const,
			message: "Already subscribed",
			alreadySubscribed: true,
			results: [{ channel: "sms" as const, alreadySubscribed: true }],
		});
		const failure = Result.err(restockErrors.rateLimited(120));

		for (const result of [success, failure]) {
			const wire = serializeResult(result, restockSubscriptionResultSchemas);
			const hydrated = deserializeResultOrThrow(
				JSON.parse(JSON.stringify(wire)),
				restockSubscriptionResultSchemas,
			);
			expect(hydrated.status).toBe(result.status);
		}
	});
});
