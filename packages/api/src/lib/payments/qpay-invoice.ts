import {
	qpayInvoiceSchema,
	type PaymentError,
	type QpayInvoice,
} from "@vit/shared";
import { Result, type Result as ResultType } from "better-result";
import { match } from "dismatch";
import * as v from "valibot";
import { kv } from "~/lib/kv";
import { pendingPaymentError } from "~/lib/payments/payment-state";
import { createQpayInvoice, type QpayProviderError } from "~/lib/payments/qpay";
import { paymentQueries } from "~/queries/payments";
import {
	qpayInvoiceQueries,
	type QpayInvoiceClaim,
} from "~/queries/qpay-invoices";

const providerUnavailable = (
	retryable: boolean,
	fallbackMethods: Array<"transfer" | "qpay"> = ["transfer"],
): PaymentError => ({
	_tag: "PaymentProviderUnavailable",
	message: "Төлбөрийн үйлчилгээтэй холбогдож чадсангүй.",
	provider: "qpay",
	retryable,
	fallbackMethods,
});

const manualReview = (
	status: "pending" | "customer_claimed_paid" | "success" | "failed",
): PaymentError => ({
	_tag: "ManualReviewRequired",
	message: "Төлбөрийг ажилтан гараар шалгах шаардлагатай байна.",
	paymentStatus: status,
});

export const mapQpayCreateError = (
	error: QpayProviderError,
	paymentStatus: "pending" | "customer_claimed_paid" | "success" | "failed",
) =>
	match(
		error,
		"_tag",
	)<PaymentError>({
		QpayRejected: ({ retryable }) => providerUnavailable(retryable),
		QpayAmbiguous: () => manualReview(paymentStatus),
		QpayMalformedResponse: () => manualReview(paymentStatus),
		QpayConfigurationError: () => providerUnavailable(false),
	});

const fromClaim = async (
	claim: QpayInvoiceClaim,
	payment: NonNullable<
		Awaited<ReturnType<typeof paymentQueries.store.getPaymentInfoByNumber>>
	>,
): Promise<ResultType<QpayInvoice, PaymentError>> =>
	match(
		claim,
		"_tag",
	)<Promise<ResultType<QpayInvoice, PaymentError>>>({
		Created: ({ response }) => Promise.resolve(Result.ok(response)),
		InProgress: () =>
			Promise.resolve(Result.err(providerUnavailable(true, []))),
		Ambiguous: () => Promise.resolve(Result.err(manualReview(payment.status))),
		Claimed: async ({ claimToken }) => {
			const isDev = process.env.NODE_ENV === "development";
			const created = await createQpayInvoice(
				isDev ? Math.ceil(payment.amount / 10000) : payment.amount,
				payment.paymentNumber,
			);
			return created.match<Promise<ResultType<QpayInvoice, PaymentError>>>({
				ok: async (response) => {
					try {
						const completed = await qpayInvoiceQueries.complete(
							payment.paymentNumber,
							claimToken,
							response,
						);
						if (!completed) {
							const persisted = await qpayInvoiceQueries.get(
								payment.paymentNumber,
							);
							if (persisted?.status === "created" && persisted.response) {
								return Result.ok(persisted.response);
							}
							return Result.err(manualReview(payment.status));
						}
					} catch {
						// QPay may have accepted the stable sender_invoice_no. The
						// persisted `creating` state prevents a second invoice call.
						return Result.err(manualReview(payment.status));
					}
					await kv()
						.put(`QPAY:${payment.paymentNumber}`, JSON.stringify(response), {
							expirationTtl: 3600,
						})
						.catch(() => undefined);
					return Result.ok(response);
				},
				err: async (error) => {
					const ambiguous =
						error._tag === "QpayAmbiguous" ||
						error._tag === "QpayMalformedResponse";
					await qpayInvoiceQueries
						.recordFailure(payment.paymentNumber, claimToken, {
							ambiguous,
							code: error._tag,
						})
						.catch(() => undefined);
					return Result.err(mapQpayCreateError(error, payment.status));
				},
			});
		},
	});

export const ensureQpayInvoiceForPayment = async (
	paymentNumber: string,
): Promise<ResultType<QpayInvoice, PaymentError>> => {
	const payment =
		await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
	if (!payment) {
		return Result.err({
			_tag: "PaymentNotFound",
			message: "Төлбөрийн мэдээлэл олдсонгүй.",
		});
	}
	const stateError = pendingPaymentError(
		payment.status,
		payment.order.orderNumber,
	);
	if (stateError) return Result.err(stateError);

	const cached = await kv()
		.get(`QPAY:${paymentNumber}`)
		.catch(() => null);
	if (cached) {
		try {
			const parsed = v.safeParse(
				qpayInvoiceSchema,
				JSON.parse(cached) as unknown,
			);
			if (parsed.success) {
				await qpayInvoiceQueries.adopt(paymentNumber, parsed.output);
				return Result.ok(parsed.output);
			}
		} catch {
			// Ignore malformed cache data. The database state remains authoritative.
		}
	}

	const persisted = await qpayInvoiceQueries.get(paymentNumber);
	if (payment.invoiceId && !persisted) {
		return Result.err(manualReview(payment.status));
	}
	return fromClaim(await qpayInvoiceQueries.claim(paymentNumber), payment);
};
