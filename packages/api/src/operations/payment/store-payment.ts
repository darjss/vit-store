import type {
	PaymentDetails,
	PaymentError,
	PaymentStatus,
	QpayInvoice,
	TransferClaim,
	TransferReconciliation,
} from "@vit/shared";
import { bankTransfer } from "@vit/shared/constants";
import { Result, type Result as ResultType } from "better-result";
import { match } from "dismatch";
import type { Context } from "~/lib/context";
import { getTransferReconciliationStub } from "~/lib/durable-objects";
import { sendTransferClaimedNotification } from "~/lib/integrations/messenger/messages";
import { checkQpayInvoice, type QpayProviderError } from "~/lib/payments/qpay";
import { paymentStateAction } from "~/lib/payments/payment-state";
import { ensureQpayInvoiceForPayment } from "~/lib/payments/qpay-invoice";
import { confirmPaymentAndNotify } from "~/lib/payments/transfer-confirmation";
import { toPublicTransferReconciliation } from "~/lib/payments/transfer-reconciliation-status";
import { getPaymentAccess } from "~/lib/session/checkout-access";
import { paymentQueries } from "~/queries/payments";

const paymentDetails = (
	payment: NonNullable<
		Awaited<ReturnType<typeof paymentQueries.store.getPaymentInfoByNumber>>
	>,
	ctx: Context,
): PaymentDetails => ({
	paymentNumber: payment.paymentNumber,
	status: payment.status,
	provider: payment.provider,
	createdAt: payment.createdAt,
	total: payment.order.total,
	transferAccount: {
		bankName: bankTransfer.bankName,
		accountNumber: ctx.c.env.KHAAN_ACCOUNT_NUMBER || bankTransfer.accountNumber,
		accountName: ctx.c.env.KHAAN_ACCOUNT_NAME || bankTransfer.accountName,
	},
	order: {
		orderNumber: payment.order.orderNumber,
		customerPhone: `${payment.order.customerPhone}`,
		status: payment.order.status,
		address: payment.order.address,
		notes: payment.order.notes,
		createdAt: payment.order.createdAt,
		products: payment.order.orderDetails.map((detail) => ({
			productId: detail.product.id,
			name: detail.product.name,
			price: detail.product.price,
			quantity: detail.quantity,
			imageUrl: detail.product.images[0]?.url,
		})),
	},
});

export const getPayment = async (
	ctx: Context,
	input: { paymentNumber: string; checkoutToken?: string },
): Promise<ResultType<PaymentDetails, PaymentError>> =>
	(await getPaymentAccess(ctx, input.paymentNumber, input.checkoutToken)).map(
		(payment) => paymentDetails(payment, ctx),
	);

export const getPaymentStatus = async (
	ctx: Context,
	input: { paymentNumber: string; checkoutToken?: string },
): Promise<ResultType<PaymentStatus, PaymentError>> =>
	(await getPaymentAccess(ctx, input.paymentNumber, input.checkoutToken)).map(
		(payment) => ({ status: payment.status, provider: payment.provider }),
	);

const notPending = (
	status: "pending" | "customer_claimed_paid" | "success" | "failed",
): PaymentError => ({
	_tag: "PaymentNotPending",
	message: "Энэ төлбөр одоо хүлээгдэж буй төлөвт биш байна.",
	status,
});

const startReconciliation = async (ctx: Context, paymentNumber: string) => {
	try {
		await getTransferReconciliationStub(ctx.c.env, paymentNumber).start({
			paymentNumber,
		});
		return true;
	} catch {
		return false;
	}
};

const sendTransferClaimAlert = async (
	payment: NonNullable<
		Awaited<ReturnType<typeof paymentQueries.store.getPaymentInfoByNumber>>
	>,
) => {
	await sendTransferClaimedNotification({
		paymentNumber: payment.paymentNumber,
		customerPhone: payment.order.customerPhone,
		address: payment.order.address,
		notes: payment.order.notes,
		total: payment.order.total,
		products: payment.order.orderDetails.map((detail) => ({
			name: detail.product.name,
			quantity: detail.quantity,
			price: detail.product.price,
			imageUrl: detail.product.images[0]?.url,
		})),
	});
};

export const claimTransfer = async (
	ctx: Context,
	input: { paymentNumber: string; checkoutToken?: string },
	options: { refusedAsError?: boolean } = {},
): Promise<ResultType<TransferClaim, PaymentError>> => {
	const accessed = await getPaymentAccess(
		ctx,
		input.paymentNumber,
		input.checkoutToken,
	);
	return accessed.match<Promise<ResultType<TransferClaim, PaymentError>>>({
		err: async (error) => Result.err(error),
		ok: async (payment) => {
			const claim = await paymentQueries.store.claimTransferPaid(
				input.paymentNumber,
			);
			return match(
				claim,
				"outcome",
			)<Promise<ResultType<TransferClaim, PaymentError>>>({
				not_found: async () =>
					Result.err({
						_tag: "PaymentNotFound",
						message: "Төлбөрийн мэдээлэл олдсонгүй.",
					}),
				refused: async ({ status }) =>
					options.refusedAsError
						? Result.err(notPending(status))
						: Result.ok({
								orderNumber: payment.order.orderNumber,
								outcome: "refused",
							}),
				already_confirmed: async () =>
					Result.ok({
						orderNumber: payment.order.orderNumber,
						outcome: "already_confirmed",
					}),
				already_claimed: async () => {
					await paymentQueries.store.changePaymentToTransfer(
						input.paymentNumber,
					);
					await startReconciliation(ctx, input.paymentNumber);
					return Result.ok({
						orderNumber: payment.order.orderNumber,
						outcome: "already_claimed",
					});
				},
				changed: async () => {
					await startReconciliation(ctx, input.paymentNumber);
					await sendTransferClaimAlert(payment).catch(() => undefined);
					return Result.ok({
						orderNumber: payment.order.orderNumber,
						outcome: "changed",
					});
				},
			});
		},
	});
};

export const selectTransfer = async (
	ctx: Context,
	input: { paymentNumber: string; checkoutToken?: string },
): Promise<ResultType<{ provider: "transfer" }, PaymentError>> => {
	const accessed = await getPaymentAccess(
		ctx,
		input.paymentNumber,
		input.checkoutToken,
	);
	return accessed.match<
		Promise<ResultType<{ provider: "transfer" }, PaymentError>>
	>({
		err: async (error) => Result.err(error),
		ok: async (payment) => {
			const state = paymentStateAction(payment.status);
			if (state === "confirmed") {
				return Result.err({
					_tag: "PaymentAlreadyConfirmed",
					message: "Төлбөр аль хэдийн баталгаажсан байна.",
					orderNumber: payment.order.orderNumber,
				});
			}
			if (state === "failed") return Result.err(notPending(payment.status));

			const selected = await paymentQueries.store.changePaymentToTransfer(
				input.paymentNumber,
			);
			if (!selected) {
				const current = await paymentQueries.store.getPaymentByNumber(
					input.paymentNumber,
				);
				if (!current) {
					return Result.err({
						_tag: "PaymentNotFound",
						message: "Төлбөрийн мэдээлэл олдсонгүй.",
					});
				}
				if (current.status === "success") {
					return Result.err({
						_tag: "PaymentAlreadyConfirmed",
						message: "Төлбөр аль хэдийн баталгаажсан байна.",
						orderNumber: current.order.orderNumber,
					});
				}
				if (current.status === "failed") {
					return Result.err(notPending(current.status));
				}
				throw new Error("Pending payment provider update did not persist.");
			}
			await startReconciliation(ctx, input.paymentNumber);
			return Result.ok({ provider: "transfer" });
		},
	});
};

export const getTransferReconciliation = async (
	ctx: Context,
	input: { paymentNumber: string; checkoutToken?: string },
): Promise<ResultType<TransferReconciliation | null, PaymentError>> => {
	const accessed = await getPaymentAccess(
		ctx,
		input.paymentNumber,
		input.checkoutToken,
	);
	return accessed.match<
		Promise<ResultType<TransferReconciliation | null, PaymentError>>
	>({
		err: async (error) => Result.err(error),
		ok: async () => {
			const state = await getTransferReconciliationStub(
				ctx.c.env,
				input.paymentNumber,
			).getStatus();
			return Result.ok(toPublicTransferReconciliation(state));
		},
	});
};

export const createQr = async (
	ctx: Context,
	input: { paymentNumber: string; checkoutToken?: string },
): Promise<ResultType<QpayInvoice, PaymentError>> => {
	const accessed = await getPaymentAccess(
		ctx,
		input.paymentNumber,
		input.checkoutToken,
	);
	return accessed.match<Promise<ResultType<QpayInvoice, PaymentError>>>({
		err: async (error) => Result.err(error),
		ok: async () => ensureQpayInvoiceForPayment(input.paymentNumber),
	});
};

const qpayCheckError = (error: QpayProviderError): PaymentError =>
	match(
		error,
		"_tag",
	)<PaymentError>({
		QpayRejected: ({ retryable }) => ({
			_tag: "PaymentProviderUnavailable",
			message: "Төлбөрийн үйлчилгээтэй холбогдож чадсангүй.",
			provider: "qpay",
			retryable,
			fallbackMethods: [],
		}),
		QpayAmbiguous: () => ({
			_tag: "PaymentProviderUnavailable",
			message: "Төлбөрийн үйлчилгээтэй холбогдож чадсангүй.",
			provider: "qpay",
			retryable: true,
			fallbackMethods: [],
		}),
		QpayMalformedResponse: () => ({
			_tag: "PaymentProviderUnavailable",
			message: "Төлбөрийн үйлчилгээтэй холбогдож чадсангүй.",
			provider: "qpay",
			retryable: false,
			fallbackMethods: [],
		}),
		QpayConfigurationError: () => ({
			_tag: "PaymentProviderUnavailable",
			message: "Төлбөрийн үйлчилгээтэй холбогдож чадсангүй.",
			provider: "qpay",
			retryable: false,
			fallbackMethods: [],
		}),
	});

export const checkQpayPayment = async (
	ctx: Context,
	input: { paymentNumber: string; checkoutToken?: string },
): Promise<
	ResultType<{ paid: boolean; orderNumber?: string }, PaymentError>
> => {
	const accessed = await getPaymentAccess(
		ctx,
		input.paymentNumber,
		input.checkoutToken,
	);
	return accessed.match<
		Promise<ResultType<{ paid: boolean; orderNumber?: string }, PaymentError>>
	>({
		err: async (error) => Result.err(error),
		ok: async (payment) => {
			if (paymentStateAction(payment.status) === "confirmed") {
				return Result.ok({
					paid: true,
					orderNumber: payment.order.orderNumber,
				});
			}
			if (payment.provider !== "qpay" || !payment.invoiceId) {
				return Result.err({
					_tag: "PaymentMethodMismatch",
					message: "Сонгосон төлбөрийн хэлбэр тохирохгүй байна.",
					expected: "qpay",
					actual: payment.provider,
				});
			}

			const checked = await checkQpayInvoice(payment.invoiceId);
			return checked.match<
				Promise<
					ResultType<{ paid: boolean; orderNumber?: string }, PaymentError>
				>
			>({
				err: async (error) => Result.err(qpayCheckError(error)),
				ok: async (paid) => {
					if (!paid) return Result.ok({ paid: false });
					const confirmation = await confirmPaymentAndNotify({
						paymentNumber: input.paymentNumber,
						provider: "qpay",
						source: "qpay_checkout",
						referrer: ctx.c.req.header("referer") ?? undefined,
					});
					return confirmation.map((value) => ({
						paid: value.confirmed,
						orderNumber: value.orderNumber ?? payment.order.orderNumber,
					}));
				},
			});
		},
	});
};
