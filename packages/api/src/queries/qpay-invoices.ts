import type { PaymentStatusType, QpayInvoice } from "@vit/shared";
import { match } from "dismatch";
import { matchAsync } from "dismatch/async";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/db/client";
import { PaymentsTable, QpayInvoicesTable } from "~/db/schema";
import type {
	QpayInvoiceClaim,
	QpayInvoiceCompletion,
} from "~/lib/payments/qpay-invoice-core";

export type { QpayInvoiceClaim } from "~/lib/payments/qpay-invoice-core";

const QPAY_CREATE_AMBIGUITY_MS = 2 * 60_000;

const qpayStates = {
	creating: { _tag: "creating" },
	created: { _tag: "created" },
	rejected: { _tag: "rejected" },
	ambiguous: { _tag: "ambiguous" },
} as const;

const paymentStates = {
	pending: { _tag: "pending" },
	customer_claimed_paid: { _tag: "customer_claimed_paid" },
	success: { _tag: "success" },
	failed: { _tag: "failed" },
} as const satisfies Record<PaymentStatusType, { _tag: PaymentStatusType }>;

type LockedPayment = {
	id: number;
	status: PaymentStatusType;
	provider: "transfer" | "qpay";
	invoiceId: string | null;
};

const attachmentErrorCode = (
	payment: LockedPayment | undefined,
	invoiceId: string,
) => {
	if (!payment) return "payment_missing_before_invoice_attachment";
	return match(
		paymentStates[payment.status],
		"_tag",
	)<string | null>({
		pending: () => {
			if (payment.provider !== "qpay") {
				return "transfer_selected_before_invoice_attachment";
			}
			if (payment.invoiceId && payment.invoiceId !== invoiceId) {
				return "payment_invoice_conflict";
			}
			return null;
		},
		customer_claimed_paid: () =>
			"transfer_claimed_before_invoice_attachment",
		success: () => "payment_confirmed_before_invoice_attachment",
		failed: () => "payment_rejected_before_invoice_attachment",
	});
};

export const qpayInvoiceQueries = {
	async get(paymentNumber: string) {
		return await db().query.QpayInvoicesTable.findFirst({
			where: eq(QpayInvoicesTable.paymentNumber, paymentNumber),
		});
	},

	async claim(paymentNumber: string): Promise<QpayInvoiceClaim> {
		const claimToken = crypto.randomUUID();
		return await db().transaction(async (tx) => {
			const [payment] = await tx
				.select({
					id: PaymentsTable.id,
					status: PaymentsTable.status,
					provider: PaymentsTable.provider,
					invoiceId: PaymentsTable.invoiceId,
				})
				.from(PaymentsTable)
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						isNull(PaymentsTable.deletedAt),
					),
				)
				.for("update");
			if (!payment) return { _tag: "Unavailable", status: null };

			const [current] = await tx
				.select({
					id: QpayInvoicesTable.id,
					status: QpayInvoicesTable.status,
					response: QpayInvoicesTable.response,
					invoiceId: QpayInvoicesTable.invoiceId,
					createdAt: QpayInvoicesTable.createdAt,
					updatedAt: QpayInvoicesTable.updatedAt,
				})
				.from(QpayInvoicesTable)
				.where(eq(QpayInvoicesTable.paymentNumber, paymentNumber))
				.for("update");

			if (!current) {
				if (payment.status !== "pending") {
					return { _tag: "Unavailable", status: payment.status };
				}
				const [selected] = await tx
					.update(PaymentsTable)
					.set({ provider: "qpay", invoiceId: null })
					.where(
						and(
							eq(PaymentsTable.id, payment.id),
							eq(PaymentsTable.status, "pending"),
							isNull(PaymentsTable.deletedAt),
						),
					)
					.returning({ id: PaymentsTable.id });
				if (!selected) {
					return { _tag: "Unavailable", status: payment.status };
				}
				await tx.insert(QpayInvoicesTable).values({
					paymentNumber,
					providerRequestId: paymentNumber,
					status: "creating",
					claimToken,
				});
				return { _tag: "Claimed", claimToken };
			}

			return matchAsync(
				qpayStates[current.status],
				"_tag",
			)<QpayInvoiceClaim>({
				created: async () => {
					if (!current.response || !current.invoiceId) {
						throw new Error("Created QPay invoice response is missing.");
					}
					const errorCode = attachmentErrorCode(payment, current.invoiceId);
					if (!errorCode && payment.invoiceId === current.invoiceId) {
						return { _tag: "Created", response: current.response };
					}
					await tx
						.update(QpayInvoicesTable)
						.set({ status: "ambiguous", lastErrorCode: errorCode })
						.where(eq(QpayInvoicesTable.id, current.id));
					return { _tag: "Ambiguous" };
				},
				creating: async () => {
					const stateUpdatedAt = current.updatedAt ?? current.createdAt;
					if (
						Date.now() - stateUpdatedAt.getTime() <
						QPAY_CREATE_AMBIGUITY_MS
					) {
						return { _tag: "InProgress" };
					}
					await tx
						.update(QpayInvoicesTable)
						.set({
							status: "ambiguous",
							lastErrorCode: "provider_outcome_unknown",
						})
						.where(eq(QpayInvoicesTable.id, current.id));
					return { _tag: "Ambiguous" };
				},
				ambiguous: () => ({ _tag: "Ambiguous" }),
				rejected: async () => {
					if (payment.status !== "pending") {
						return { _tag: "Unavailable", status: payment.status };
					}
					const [selected] = await tx
						.update(PaymentsTable)
						.set({ provider: "qpay", invoiceId: null })
						.where(
							and(
								eq(PaymentsTable.id, payment.id),
								eq(PaymentsTable.status, "pending"),
								isNull(PaymentsTable.deletedAt),
							),
						)
						.returning({ id: PaymentsTable.id });
					if (!selected) {
						return { _tag: "Unavailable", status: payment.status };
					}
					await tx
						.update(QpayInvoicesTable)
						.set({
							status: "creating",
							claimToken,
							invoiceId: null,
							response: null,
							lastErrorCode: null,
						})
						.where(eq(QpayInvoicesTable.id, current.id));
					return { _tag: "Claimed", claimToken };
				},
			});
		});
	},

	async complete(
		paymentNumber: string,
		claimToken: string,
		response: QpayInvoice,
	): Promise<QpayInvoiceCompletion> {
		return await db().transaction(async (tx) => {
			const [payment] = await tx
				.select({
					id: PaymentsTable.id,
					status: PaymentsTable.status,
					provider: PaymentsTable.provider,
					invoiceId: PaymentsTable.invoiceId,
				})
				.from(PaymentsTable)
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						isNull(PaymentsTable.deletedAt),
					),
				)
				.for("update");
			const [current] = await tx
				.select({
					id: QpayInvoicesTable.id,
					status: QpayInvoicesTable.status,
					claimToken: QpayInvoicesTable.claimToken,
					invoiceId: QpayInvoicesTable.invoiceId,
					response: QpayInvoicesTable.response,
				})
				.from(QpayInvoicesTable)
				.where(eq(QpayInvoicesTable.paymentNumber, paymentNumber))
				.for("update");
			const paymentStatus = payment?.status ?? null;

			if (
				current?.status === "created" &&
				current.invoiceId === response.invoice_id &&
				current.response &&
				!attachmentErrorCode(payment, response.invoice_id) &&
				payment?.invoiceId === response.invoice_id
			) {
				return { _tag: "AlreadyAttached", response: current.response };
			}

			if (!current) {
				await tx.insert(QpayInvoicesTable).values({
					paymentNumber,
					providerRequestId: paymentNumber,
					status: "ambiguous",
					claimToken,
					invoiceId: response.invoice_id,
					response,
					lastErrorCode: "invoice_claim_missing_after_provider_create",
				});
				return { _tag: "ManualReview", paymentStatus };
			}

			if (
				current.status !== "creating" ||
				current.claimToken !== claimToken
			) {
				await tx
					.update(QpayInvoicesTable)
					.set({
						status: "ambiguous",
						invoiceId: current.invoiceId ?? response.invoice_id,
						response: current.response ?? response,
						lastErrorCode: "invoice_claim_lost_after_provider_create",
					})
					.where(eq(QpayInvoicesTable.id, current.id));
				return { _tag: "ManualReview", paymentStatus };
			}

			const errorCode = attachmentErrorCode(payment, response.invoice_id);
			if (errorCode) {
				await tx
					.update(QpayInvoicesTable)
					.set({
						status: "ambiguous",
						invoiceId: response.invoice_id,
						response,
						lastErrorCode: errorCode,
					})
					.where(eq(QpayInvoicesTable.id, current.id));
				return { _tag: "ManualReview", paymentStatus };
			}

			const [attached] = await tx
				.update(PaymentsTable)
				.set({ invoiceId: response.invoice_id })
				.where(
					and(
						eq(PaymentsTable.id, payment.id),
						eq(PaymentsTable.status, "pending"),
						eq(PaymentsTable.provider, "qpay"),
						isNull(PaymentsTable.invoiceId),
						isNull(PaymentsTable.deletedAt),
					),
				)
				.returning({ id: PaymentsTable.id });
			if (!attached) {
				await tx
					.update(QpayInvoicesTable)
					.set({
						status: "ambiguous",
						invoiceId: response.invoice_id,
						response,
						lastErrorCode: "payment_update_not_applied",
					})
					.where(eq(QpayInvoicesTable.id, current.id));
				return { _tag: "ManualReview", paymentStatus };
			}

			const [completed] = await tx
				.update(QpayInvoicesTable)
				.set({
					status: "created",
					invoiceId: response.invoice_id,
					response,
					lastErrorCode: null,
				})
				.where(
					and(
						eq(QpayInvoicesTable.id, current.id),
						eq(QpayInvoicesTable.status, "creating"),
						eq(QpayInvoicesTable.claimToken, claimToken),
					),
				)
				.returning({ id: QpayInvoicesTable.id });
			if (!completed) {
				throw new Error("QPay invoice completion did not persist.");
			}
			return { _tag: "Attached" };
		});
	},

	async recordFailure(
		paymentNumber: string,
		claimToken: string,
		input: { ambiguous: boolean; code: string },
	) {
		await db().transaction(async (tx) => {
			const [payment] = await tx
				.select({
					id: PaymentsTable.id,
					status: PaymentsTable.status,
					provider: PaymentsTable.provider,
					invoiceId: PaymentsTable.invoiceId,
				})
				.from(PaymentsTable)
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						isNull(PaymentsTable.deletedAt),
					),
				)
				.for("update");
			await tx
				.update(QpayInvoicesTable)
				.set({
					status: input.ambiguous ? "ambiguous" : "rejected",
					lastErrorCode: input.code,
				})
				.where(
					and(
						eq(QpayInvoicesTable.paymentNumber, paymentNumber),
						eq(QpayInvoicesTable.status, "creating"),
						eq(QpayInvoicesTable.claimToken, claimToken),
					),
				);
			if (
				!input.ambiguous &&
				payment?.status === "pending" &&
				payment.provider === "qpay" &&
				!payment.invoiceId
			) {
				await tx
					.update(PaymentsTable)
					.set({ provider: "transfer" })
					.where(
						and(
							eq(PaymentsTable.id, payment.id),
							eq(PaymentsTable.status, "pending"),
							eq(PaymentsTable.provider, "qpay"),
							isNull(PaymentsTable.invoiceId),
							isNull(PaymentsTable.deletedAt),
						),
					);
			}
		});
	},

	async adopt(
		paymentNumber: string,
		response: QpayInvoice,
	): Promise<QpayInvoiceCompletion> {
		return await db().transaction(async (tx) => {
			const [payment] = await tx
				.select({
					id: PaymentsTable.id,
					status: PaymentsTable.status,
					provider: PaymentsTable.provider,
					invoiceId: PaymentsTable.invoiceId,
				})
				.from(PaymentsTable)
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						isNull(PaymentsTable.deletedAt),
					),
				)
				.for("update");
			const [current] = await tx
				.select({
					id: QpayInvoicesTable.id,
					status: QpayInvoicesTable.status,
					invoiceId: QpayInvoicesTable.invoiceId,
					response: QpayInvoicesTable.response,
				})
				.from(QpayInvoicesTable)
				.where(eq(QpayInvoicesTable.paymentNumber, paymentNumber))
				.for("update");
			const paymentStatus = payment?.status ?? null;
			if (
				current?.status === "created" &&
				current.invoiceId === response.invoice_id &&
				current.response &&
				payment?.status === "pending" &&
				payment.provider === "qpay" &&
				payment.invoiceId === response.invoice_id
			) {
				return { _tag: "AlreadyAttached", response: current.response };
			}
			if (current) {
				await tx
					.update(QpayInvoicesTable)
					.set({
						status: "ambiguous",
						invoiceId: current.invoiceId ?? response.invoice_id,
						response: current.response ?? response,
						lastErrorCode: "cached_invoice_state_conflict",
					})
					.where(eq(QpayInvoicesTable.id, current.id));
				return { _tag: "ManualReview", paymentStatus };
			}

			const attached =
				payment?.status === "pending" &&
				payment.provider === "qpay" &&
				payment.invoiceId === response.invoice_id;
			await tx.insert(QpayInvoicesTable).values({
				paymentNumber,
				providerRequestId: paymentNumber,
				status: attached ? "created" : "ambiguous",
				claimToken: crypto.randomUUID(),
				invoiceId: response.invoice_id,
				response,
				lastErrorCode: attached
					? null
					: "cached_invoice_payment_state_mismatch",
			});
			return attached
				? { _tag: "Attached" }
				: { _tag: "ManualReview", paymentStatus };
		});
	},
};
