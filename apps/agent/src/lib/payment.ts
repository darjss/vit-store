import { TRPCClientError } from "@trpc/client";
import { Result } from "better-result";
import * as v from "valibot";
import { storeClient, withTimeout } from "./store-client";

export const paymentOperationFailureSchema = v.variant("_tag", [
	v.strictObject({
		_tag: v.literal("RetryablePaymentFailure"),
		retryable: v.literal(true),
	}),
	v.strictObject({
		_tag: v.literal("AmbiguousPaymentFailure"),
		retryable: v.literal(false),
	}),
	v.strictObject({
		_tag: v.literal("PermanentPaymentFailure"),
		retryable: v.literal(false),
	}),
	v.strictObject({
		_tag: v.literal("InvalidPaymentRequest"),
		retryable: v.literal(false),
	}),
]);

export type PaymentOperationFailure = v.InferOutput<
	typeof paymentOperationFailureSchema
>;

const paymentReferenceSchema = v.strictObject({
	paymentNumber: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
	checkoutToken: v.nullable(
		v.pipe(v.string(), v.minLength(1), v.maxLength(512)),
	),
});

const paymentSummarySchema = v.object({
	paymentNumber: v.string(),
	status: v.string(),
	total: v.number(),
	order: v.object({
		orderNumber: v.string(),
		customerPhone: v.string(),
	}),
});

export type PaymentSummary = v.InferOutput<typeof paymentSummarySchema>;

const claimResultSchema = v.object({
	orderNumber: v.nullable(v.optional(v.string())),
	outcome: v.picklist([
		"changed",
		"already_claimed",
		"already_confirmed",
		"refused",
	]),
});

export type TransferClaimResult = v.InferOutput<typeof claimResultSchema>;

const isTimeout = (error: unknown) =>
	error instanceof DOMException &&
	(error.name === "TimeoutError" || error.name === "AbortError");

const classifyStoreFailure = (
	error: unknown,
	operation: "query" | "mutation",
): PaymentOperationFailure | undefined => {
	if (error instanceof TRPCClientError) {
		const code = error.data?.code;
		if (code === "TOO_MANY_REQUESTS") {
			return { _tag: "RetryablePaymentFailure", retryable: true };
		}
		if (
			code === "BAD_REQUEST" ||
			code === "UNPROCESSABLE_CONTENT" ||
			code === "UNAUTHORIZED" ||
			code === "FORBIDDEN" ||
			code === "NOT_FOUND"
		) {
			return { _tag: "PermanentPaymentFailure", retryable: false };
		}
		return operation === "mutation"
			? { _tag: "AmbiguousPaymentFailure", retryable: false }
			: { _tag: "RetryablePaymentFailure", retryable: true };
	}
	if (error instanceof TypeError || isTimeout(error)) {
		return operation === "mutation"
			? { _tag: "AmbiguousPaymentFailure", retryable: false }
			: { _tag: "RetryablePaymentFailure", retryable: true };
	}
	return undefined;
};

const validateReference = (
	paymentNumber: string,
	checkoutToken: string | null,
) => v.safeParse(paymentReferenceSchema, { paymentNumber, checkoutToken });

export const fetchPaymentSummary = async (
	paymentNumber: string,
	checkoutToken: string | null,
	outerSignal?: AbortSignal,
) => {
	const reference = validateReference(paymentNumber, checkoutToken);
	if (!reference.success) {
		return Result.err<PaymentSummary, PaymentOperationFailure>({
			_tag: "InvalidPaymentRequest",
			retryable: false,
		});
	}
	let data: unknown;
	try {
		data = await storeClient().payment.getPaymentByNumber.query(
			{
				paymentNumber: reference.output.paymentNumber,
				...(reference.output.checkoutToken
					? { checkoutToken: reference.output.checkoutToken }
					: {}),
			},
			{ signal: withTimeout(outerSignal) },
		);
	} catch (error) {
		const failure = classifyStoreFailure(error, "query");
		if (failure === undefined) throw error;
		return Result.err<PaymentSummary, PaymentOperationFailure>(failure);
	}
	const parsed = v.safeParse(paymentSummarySchema, data);
	return parsed.success
		? Result.ok<PaymentSummary, PaymentOperationFailure>(parsed.output)
		: Result.err<PaymentSummary, PaymentOperationFailure>({
				_tag: "PermanentPaymentFailure",
				retryable: false,
			});
};

export const claimTransfer = async (
	paymentNumber: string,
	checkoutToken: string | null,
	outerSignal?: AbortSignal,
) => {
	const reference = validateReference(paymentNumber, checkoutToken);
	if (!reference.success) {
		return Result.err<TransferClaimResult, PaymentOperationFailure>({
			_tag: "InvalidPaymentRequest",
			retryable: false,
		});
	}
	let data: unknown;
	try {
		data = await storeClient().payment.claimTransferPaid.mutate(
			{
				paymentNumber: reference.output.paymentNumber,
				...(reference.output.checkoutToken
					? { checkoutToken: reference.output.checkoutToken }
					: {}),
			},
			{ signal: withTimeout(outerSignal) },
		);
	} catch (error) {
		const failure = classifyStoreFailure(error, "mutation");
		if (failure === undefined) throw error;
		return Result.err<TransferClaimResult, PaymentOperationFailure>(failure);
	}
	const parsed = v.safeParse(claimResultSchema, data);
	return parsed.success
		? Result.ok<TransferClaimResult, PaymentOperationFailure>(parsed.output)
		: Result.err<TransferClaimResult, PaymentOperationFailure>({
				_tag: "AmbiguousPaymentFailure",
				retryable: false,
			});
};
