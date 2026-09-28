import type {
	PaymentError,
	PaymentStatusType,
	QpayInvoice,
} from "@vit/shared";
import { Result, type Result as ResultType } from "better-result";
import { match } from "dismatch";
import type { QpayProviderError } from "~/lib/payments/qpay";

export type QpayInvoicePayment = {
	paymentNumber: string;
	amount: number;
	status: PaymentStatusType;
	provider: "transfer" | "qpay";
	invoiceId: string | null;
	order: { orderNumber: string };
};

export type QpayInvoiceClaim =
	| { _tag: "Claimed"; claimToken: string }
	| { _tag: "Created"; response: QpayInvoice }
	| { _tag: "InProgress" }
	| { _tag: "Ambiguous" }
	| { _tag: "Unavailable"; status: PaymentStatusType | null };

export type QpayInvoiceCompletion =
	| { _tag: "Attached" }
	| { _tag: "AlreadyAttached"; response: QpayInvoice }
	| { _tag: "ManualReview"; paymentStatus: PaymentStatusType | null };

export type QpayInvoiceRecord = {
	status: "creating" | "created" | "rejected" | "ambiguous";
	response: QpayInvoice | null;
};

export type QpayInvoiceDependencies = {
	loadPayment: (paymentNumber: string) => Promise<QpayInvoicePayment | null>;
	readCached: (paymentNumber: string) => Promise<QpayInvoice | null>;
	cache: (paymentNumber: string, response: QpayInvoice) => Promise<void>;
	get: (paymentNumber: string) => Promise<QpayInvoiceRecord | undefined>;
	claim: (paymentNumber: string) => Promise<QpayInvoiceClaim>;
	adopt: (
		paymentNumber: string,
		response: QpayInvoice,
	) => Promise<QpayInvoiceCompletion>;
	create: (
		amount: number,
		paymentNumber: string,
	) => Promise<ResultType<QpayInvoice, QpayProviderError>>;
	complete: (
		paymentNumber: string,
		claimToken: string,
		response: QpayInvoice,
	) => Promise<QpayInvoiceCompletion>;
	recordFailure: (
		paymentNumber: string,
		claimToken: string,
		input: { ambiguous: boolean; code: string },
	) => Promise<void>;
};

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

const manualReview = (status: PaymentStatusType): PaymentError => ({
	_tag: "ManualReviewRequired",
	message: "Төлбөрийг ажилтан гараар шалгах шаардлагатай байна.",
	paymentStatus: status,
});

export const mapQpayCreateError = (
	error: QpayProviderError,
	paymentStatus: PaymentStatusType,
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

const paymentStates = {
	pending: { _tag: "pending" },
	customer_claimed_paid: { _tag: "customer_claimed_paid" },
	success: { _tag: "success" },
	failed: { _tag: "failed" },
} as const satisfies Record<PaymentStatusType, { _tag: PaymentStatusType }>;

const unavailablePaymentError = (
	status: PaymentStatusType | null,
	orderNumber?: string,
): PaymentError => {
	if (!status) {
		return {
			_tag: "PaymentNotFound",
			message: "Төлбөрийн мэдээлэл олдсонгүй.",
		};
	}
	return match(
		paymentStates[status],
		"_tag",
	)<PaymentError>({
		pending: () => manualReview(status),
		customer_claimed_paid: () => ({
			_tag: "PaymentNotPending",
			message: "Энэ төлбөр одоо хүлээгдэж буй төлөвт биш байна.",
			status,
		}),
		success: () => ({
			_tag: "PaymentAlreadyConfirmed",
			message: "Төлбөр аль хэдийн баталгаажсан байна.",
			orderNumber,
		}),
		failed: () => ({
			_tag: "PaymentNotPending",
			message: "Энэ төлбөр одоо хүлээгдэж буй төлөвт биш байна.",
			status,
		}),
	});
};

const finishCompletion = async (
	completion: QpayInvoiceCompletion,
	response: QpayInvoice,
	payment: QpayInvoicePayment,
	dependencies: QpayInvoiceDependencies,
): Promise<ResultType<QpayInvoice, PaymentError>> =>
	match(
		completion,
		"_tag",
	)<Promise<ResultType<QpayInvoice, PaymentError>>>({
		Attached: async () => {
			await dependencies
				.cache(payment.paymentNumber, response)
				.catch(() => undefined);
			return Result.ok(response);
		},
		AlreadyAttached: async ({ response: attached }) => {
			await dependencies
				.cache(payment.paymentNumber, attached)
				.catch(() => undefined);
			return Result.ok(attached);
		},
		ManualReview: async ({ paymentStatus }) =>
			Result.err(manualReview(paymentStatus ?? payment.status)),
	});

const fromClaim = async (
	claim: QpayInvoiceClaim,
	payment: QpayInvoicePayment,
	dependencies: QpayInvoiceDependencies,
): Promise<ResultType<QpayInvoice, PaymentError>> =>
	match(
		claim,
		"_tag",
	)<Promise<ResultType<QpayInvoice, PaymentError>>>({
		Created: ({ response }) => Promise.resolve(Result.ok(response)),
		InProgress: () =>
			Promise.resolve(Result.err(providerUnavailable(true, []))),
		Ambiguous: () => Promise.resolve(Result.err(manualReview(payment.status))),
		Unavailable: ({ status }) =>
			Promise.resolve(
				Result.err(unavailablePaymentError(status, payment.order.orderNumber)),
			),
		Claimed: async ({ claimToken }) => {
			const isDev = process.env.NODE_ENV === "development";
			const created = await dependencies.create(
				isDev ? Math.ceil(payment.amount / 10000) : payment.amount,
				payment.paymentNumber,
			);
			return created.match<Promise<ResultType<QpayInvoice, PaymentError>>>({
				ok: async (response) => {
					try {
						const completion = await dependencies.complete(
							payment.paymentNumber,
							claimToken,
							response,
						);
						return finishCompletion(
							completion,
							response,
							payment,
							dependencies,
						);
					} catch {
						// The provider accepted the stable payment number, but the local
						// completion outcome is unknown. Do not call the provider again.
						return Result.err(manualReview(payment.status));
					}
				},
				err: async (error) => {
					const ambiguous =
						error._tag === "QpayAmbiguous" ||
						error._tag === "QpayMalformedResponse";
					await dependencies
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

export const ensureQpayInvoiceWithDependencies = async (
	paymentNumber: string,
	dependencies: QpayInvoiceDependencies,
): Promise<ResultType<QpayInvoice, PaymentError>> => {
	const payment = await dependencies.loadPayment(paymentNumber);
	if (!payment) {
		return Result.err({
			_tag: "PaymentNotFound",
			message: "Төлбөрийн мэдээлэл олдсонгүй.",
		});
	}
	if (payment.status !== "pending") {
		return Result.err(
			unavailablePaymentError(payment.status, payment.order.orderNumber),
		);
	}

	const [cached, persisted] = await Promise.all([
		dependencies.readCached(paymentNumber),
		dependencies.get(paymentNumber),
	]);
	if (cached && !persisted) {
		const adoption = await dependencies.adopt(paymentNumber, cached);
		return finishCompletion(adoption, cached, payment, dependencies);
	}
	if (payment.invoiceId && !persisted) {
		return Result.err(manualReview(payment.status));
	}
	return fromClaim(await dependencies.claim(paymentNumber), payment, dependencies);
};
