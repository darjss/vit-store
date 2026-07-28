import { Result, type Result as ResultType } from "better-result";
import { match } from "dismatch";
import { and, desc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "~/db/client";
import {
	KhaanConsumedTransactionsTable,
	MessengerNotificationFailuresTable,
	OrderDetailsTable,
	OrdersTable,
	type PaymentInsertType,
	PaymentNotificationOutboxTable,
	PaymentPostCommitRecoveryTable,
	PaymentsTable,
	ProductImagesTable,
	PurchaseItemsTable,
	PurchaseReceiptItemsTable,
	SalesTable,
} from "~/db/schema";
import {
	KhaanTransactionAlreadyConsumedError,
	recordConsumedKhaanTransaction,
} from "~/lib/payments/consumed-transaction";
import type {
	PaymentCommit,
	PaymentCommitError,
} from "~/lib/payments/payment-confirmation-core";
import {
	applyStockTransition,
	StockTransitionRejected,
} from "~/lib/stock/transition";
import type { TransactionType } from "~/lib/types";
import type { paymentProvider, paymentStatus } from "~/lib/utils";

type PaymentProviderType = (typeof paymentProvider)[number];
type PaymentStatusType = (typeof paymentStatus)[number];

const paymentStates = {
	pending: { _tag: "pending" },
	customer_claimed_paid: { _tag: "customer_claimed_paid" },
	success: { _tag: "success" },
	failed: { _tag: "failed" },
} as const satisfies Record<PaymentStatusType, { _tag: PaymentStatusType }>;

class PaymentCommitAbort extends Error {
	constructor(readonly failure: PaymentCommitError) {
		super(`Payment commit aborted: ${failure._tag}`);
		this.name = "PaymentCommitAbort";
	}
}

export type PaymentRecoveryEffect =
	| "cache_purge"
	| "messenger_notification"
	| "analytics";

// Accept either a live db() handle or a transaction tx so the canonical
// implementation can be called both inside transactions (addOrder/updateOrder/
// confirmPaymentAndApplyStock) and from non-transactional query endpoints
// (purchase.getAverageCostOfProduct).
type DbOrTx = ReturnType<typeof db> | TransactionType;

export async function getAverageCostOfProduct(
	tx: DbOrTx,
	productId: number,
	createdAt: Date,
) {
	const purchaseItems = await tx.query.PurchaseItemsTable.findMany({
		where: and(
			eq(PurchaseItemsTable.productId, productId),
			isNull(PurchaseItemsTable.deletedAt),
		),
		with: {
			purchase: {
				columns: {
					orderedAt: true,
					createdAt: true,
					cancelledAt: true,
					deletedAt: true,
				},
			},
			receiptItems: {
				where: isNull(PurchaseReceiptItemsTable.deletedAt),
				columns: {
					quantityReceived: true,
				},
			},
		},
	});

	const totals = purchaseItems.reduce(
		(acc, item) => {
			if (item.purchase.deletedAt) return acc;
			const effectiveDate = item.purchase.orderedAt ?? item.purchase.createdAt;
			if (effectiveDate >= createdAt) return acc;

			const receivedQuantity = item.receiptItems.reduce(
				(sum, receiptItem) => sum + receiptItem.quantityReceived,
				0,
			);
			const effectiveQuantity = item.purchase.cancelledAt
				? receivedQuantity
				: item.quantityOrdered;
			acc.totalCost += effectiveQuantity * item.unitCost;
			acc.totalQuantity += effectiveQuantity;
			return acc;
		},
		{ totalCost: 0, totalQuantity: 0 },
	);

	return totals.totalQuantity > 0 ? totals.totalCost / totals.totalQuantity : 0;
}

export const paymentQueries = {
	admin: {
		async createPayment(data: {
			paymentNumber: string;
			orderId: number;
			provider: PaymentProviderType;
			status: PaymentStatusType;
			amount: number;
		}) {
			return db().transaction((tx) => this.createPaymentTx(tx, data));
		},

		async createPaymentTx(
			tx: DbOrTx,
			data: {
				paymentNumber: string;
				orderId: number;
				provider: PaymentProviderType;
				status: PaymentStatusType;
				amount: number;
			},
		) {
			const result = await tx
				.insert(PaymentsTable)
				.values({
					paymentNumber: data.paymentNumber,
					orderId: data.orderId,
					provider: data.provider,
					status: data.status,
					amount: data.amount,
				})
				.returning({
					id: PaymentsTable.id,
					paymentNumber: PaymentsTable.paymentNumber,
				});
			const payment = result[0];
			if (data.status === "success") {
				await tx
					.insert(PaymentNotificationOutboxTable)
					.values({
						paymentNumber: data.paymentNumber,
						purpose: "order_payment_confirmed_sms",
					})
					.onConflictDoNothing();
			}
			return payment;
		},

		async getPayments() {
			return db()
				.select({
					id: PaymentsTable.id,
					paymentNumber: PaymentsTable.paymentNumber,
					orderId: PaymentsTable.orderId,
					provider: PaymentsTable.provider,
					status: PaymentsTable.status,
					amount: PaymentsTable.amount,
					createdAt: PaymentsTable.createdAt,
					updatedAt: PaymentsTable.updatedAt,
				})
				.from(PaymentsTable);
		},

		async getPendingPayments() {
			return db()
				.select({
					id: PaymentsTable.id,
					paymentNumber: PaymentsTable.paymentNumber,
					orderId: PaymentsTable.orderId,
					provider: PaymentsTable.provider,
					status: PaymentsTable.status,
					amount: PaymentsTable.amount,
					createdAt: PaymentsTable.createdAt,
					updatedAt: PaymentsTable.updatedAt,
				})
				.from(PaymentsTable)
				.where(eq(PaymentsTable.status, "pending"));
		},

		async updatePaymentStatus(orderId: number, status: PaymentStatusType) {
			const latest = await db().query.PaymentsTable.findFirst({
				where: and(
					eq(PaymentsTable.orderId, orderId),
					isNull(PaymentsTable.deletedAt),
				),
				orderBy: desc(PaymentsTable.createdAt),
				columns: { id: true },
			});
			if (!latest) return;
			await db()
				.update(PaymentsTable)
				.set({ status })
				.where(eq(PaymentsTable.id, latest.id));
		},

		async getLatestPaymentByOrderId(orderId: number) {
			return db().query.PaymentsTable.findFirst({
				where: and(
					eq(PaymentsTable.orderId, orderId),
					isNull(PaymentsTable.deletedAt),
				),
				orderBy: desc(PaymentsTable.createdAt),
				columns: {
					id: true,
					status: true,
					paymentNumber: true,
					provider: true,
				},
			});
		},

		async getLatestPaymentByOrderIdTx(tx: TransactionType, orderId: number) {
			return tx.query.PaymentsTable.findFirst({
				where: and(
					eq(PaymentsTable.orderId, orderId),
					isNull(PaymentsTable.deletedAt),
				),
				orderBy: desc(PaymentsTable.createdAt),
				columns: {
					id: true,
					status: true,
					paymentNumber: true,
					provider: true,
				},
			});
		},

		async updatePaymentStatusTx(
			tx: TransactionType,
			orderId: number,
			status: PaymentStatusType,
		) {
			const latest = await tx.query.PaymentsTable.findFirst({
				where: and(
					eq(PaymentsTable.orderId, orderId),
					isNull(PaymentsTable.deletedAt),
				),
				orderBy: desc(PaymentsTable.createdAt),
				columns: { id: true },
			});
			if (!latest) return;
			await tx
				.update(PaymentsTable)
				.set({ status })
				.where(eq(PaymentsTable.id, latest.id));
			if (status === "success") {
				const payment = await tx.query.PaymentsTable.findFirst({
					where: eq(PaymentsTable.id, latest.id),
					columns: { paymentNumber: true },
				});
				if (payment)
					await tx
						.insert(PaymentNotificationOutboxTable)
						.values({
							paymentNumber: payment.paymentNumber,
							purpose: "order_payment_confirmed_sms",
						})
						.onConflictDoNothing();
			}
		},

		async getPendingMessengerNotifications() {
			return db()
				.select({
					id: MessengerNotificationFailuresTable.id,
					paymentNumber: MessengerNotificationFailuresTable.paymentNumber,
					purpose: MessengerNotificationFailuresTable.purpose,
					status: MessengerNotificationFailuresTable.status,
					errorCode: MessengerNotificationFailuresTable.errorCode,
					retryCount: MessengerNotificationFailuresTable.retryCount,
					lastAttemptAt: MessengerNotificationFailuresTable.lastAttemptAt,
					createdAt: MessengerNotificationFailuresTable.createdAt,
				})
				.from(MessengerNotificationFailuresTable)
				.where(eq(MessengerNotificationFailuresTable.status, "pending"));
		},

		async getClaimedTransferCount() {
			const result = await db()
				.select({ count: sql<number>`COUNT(*)` })
				.from(PaymentsTable)
				.where(
					and(
						eq(PaymentsTable.status, "customer_claimed_paid"),
						eq(PaymentsTable.provider, "transfer"),
						isNull(PaymentsTable.deletedAt),
					),
				)
				.limit(1);
			return result[0]?.count ?? 0;
		},

		async getClaimedTransferPayments() {
			const payments = await db().query.PaymentsTable.findMany({
				where: and(
					eq(PaymentsTable.status, "customer_claimed_paid"),
					eq(PaymentsTable.provider, "transfer"),
					isNull(PaymentsTable.deletedAt),
				),
				orderBy: desc(PaymentsTable.updatedAt),
				columns: {
					paymentNumber: true,
					orderId: true,
					amount: true,
					createdAt: true,
					updatedAt: true,
				},
				with: {
					order: {
						columns: {
							id: true,
							orderNumber: true,
							customerPhone: true,
							total: true,
						},
						with: {
							orderDetails: {
								columns: { quantity: true },
								where: isNull(OrderDetailsTable.deletedAt),
								with: {
									product: {
										columns: { name: true },
									},
								},
							},
						},
					},
				},
			});

			return payments.map((payment) => ({
				paymentNumber: payment.paymentNumber,
				orderId: payment.orderId,
				orderNumber: payment.order.orderNumber,
				customerPhone: `${payment.order.customerPhone}`,
				total: payment.order.total,
				amount: payment.amount,
				createdAt: payment.createdAt,
				updatedAt: payment.updatedAt,
				products: payment.order.orderDetails.map((detail) => ({
					name: detail.product.name,
					quantity: detail.quantity,
				})),
			}));
		},
	},

	store: {
		async getPaymentInfoByNumber(paymentNumber: string) {
			return db().query.PaymentsTable.findFirst({
				where: and(
					eq(PaymentsTable.paymentNumber, paymentNumber),
					isNull(PaymentsTable.deletedAt),
				),
				with: {
					order: {
						columns: {
							id: true,
							orderNumber: true,
							total: true,
							status: true,
							address: true,
							customerPhone: true,
							notes: true,
							createdAt: true,
						},
						with: {
							orderDetails: {
								columns: {
									quantity: true,
								},
								with: {
									product: {
										columns: {
											id: true,
											name: true,
											price: true,
										},
										with: {
											images: {
												columns: {
													url: true,
												},
												where: and(
													eq(ProductImagesTable.isPrimary, true),
													isNull(ProductImagesTable.deletedAt),
												),
											},
										},
									},
								},
							},
						},
					},
				},
			});
		},

		async getConsumedKhaanFingerprints(
			fingerprints: string[],
		): Promise<Set<string>> {
			if (fingerprints.length === 0) {
				return new Set();
			}
			const rows = await db()
				.select({ fingerprint: KhaanConsumedTransactionsTable.fingerprint })
				.from(KhaanConsumedTransactionsTable)
				.where(
					inArray(KhaanConsumedTransactionsTable.fingerprint, fingerprints),
				);
			return new Set(rows.map((row) => row.fingerprint));
		},

		async confirmPaymentAndApplyStock(
			paymentNumber: string,
			provider: PaymentProviderType,
			consumedKhaanTransactions?: { fingerprint: string }[],
		): Promise<ResultType<PaymentCommit, PaymentCommitError>> {
			try {
				return await db().transaction(async (tx) => {
					const [payment] = await tx
						.select({
							orderId: PaymentsTable.orderId,
							status: PaymentsTable.status,
						})
						.from(PaymentsTable)
						.where(
							and(
								eq(PaymentsTable.paymentNumber, paymentNumber),
								isNull(PaymentsTable.deletedAt),
							),
						)
						.for("update");
					if (!payment) {
						throw new PaymentCommitAbort({ _tag: "PaymentNotFound" });
					}

					// Fingerprints are recorded while the payment row is locked. A
					// same-payment replay is idempotent; a different payment aborts.
					for (const { fingerprint } of consumedKhaanTransactions ?? []) {
						await recordConsumedKhaanTransaction(tx, {
							fingerprint,
							paymentNumber,
						});
					}

					const action = match(
						paymentStates[payment.status],
						"_tag",
					)<"confirm" | "replay" | "reject">({
						pending: () => "confirm" as const,
						customer_claimed_paid: () => "confirm" as const,
						success: () => "replay" as const,
						failed: () => "reject" as const,
					});
					if (action === "replay") {
						return Result.ok({
							outcome: "already_confirmed",
							orderId: payment.orderId,
						});
					}
					if (action === "reject") {
						throw new PaymentCommitAbort({
							_tag: "PaymentNotPending",
							status: payment.status,
						});
					}

					await tx
						.update(PaymentsTable)
						.set({ status: "success", provider })
						.where(eq(PaymentsTable.paymentNumber, paymentNumber));

					await tx
						.insert(PaymentNotificationOutboxTable)
						.values({
							paymentNumber,
							purpose: "order_payment_confirmed_sms",
						})
						.onConflictDoNothing();
					await tx
						.insert(PaymentPostCommitRecoveryTable)
						.values(
							(
								["cache_purge", "messenger_notification", "analytics"] as const
							).map((effect) => ({ paymentNumber, effect })),
						)
						.onConflictDoNothing();

					const orderDetails = await tx.query.OrderDetailsTable.findMany({
						where: and(
							eq(OrderDetailsTable.orderId, payment.orderId),
							isNull(OrderDetailsTable.deletedAt),
						),
						with: {
							product: {
								columns: { id: true, price: true },
							},
						},
					});

					for (const detail of orderDetails) {
						const stock = await applyStockTransition(tx, {
							productId: detail.product.id,
							delta: -detail.quantity,
							requireActive: true,
							requireNonNegative: true,
						});
						if (stock.isErr()) {
							throw new StockTransitionRejected(stock.error);
						}

						const productCost = await getAverageCostOfProduct(
							tx,
							detail.product.id,
							new Date(),
						);
						await tx.insert(SalesTable).values({
							orderId: payment.orderId,
							productId: detail.product.id,
							quantitySold: detail.quantity,
							productCost,
							sellingPrice: detail.price ?? detail.product.price,
						});
					}

					await tx
						.update(OrdersTable)
						.set({ status: "pending" })
						.where(
							and(
								eq(OrdersTable.id, payment.orderId),
								eq(OrdersTable.status, "created"),
							),
						);

					return Result.ok({ outcome: "confirmed", orderId: payment.orderId });
				});
			} catch (error) {
				if (error instanceof PaymentCommitAbort) {
					return Result.err(error.failure);
				}
				if (error instanceof KhaanTransactionAlreadyConsumedError) {
					return Result.err({ _tag: "BankTransactionAlreadyConsumed" });
				}
				if (error instanceof StockTransitionRejected) {
					return Result.err({
						_tag: "StockTransitionFailed",
						failure: error.failure,
					});
				}
				throw error;
			}
		},

		async claimPostCommitRecovery(
			paymentNumber: string,
			effect: PaymentRecoveryEffect,
		) {
			const token = crypto.randomUUID();
			const now = new Date();
			const claimable =
				effect === "messenger_notification"
					? eq(PaymentPostCommitRecoveryTable.status, "pending")
					: or(
							eq(PaymentPostCommitRecoveryTable.status, "pending"),
							and(
								eq(PaymentPostCommitRecoveryTable.status, "claimed"),
								lte(PaymentPostCommitRecoveryTable.claimUntil, now),
							),
						);
			const [claimed] = await db()
				.update(PaymentPostCommitRecoveryTable)
				.set({
					status: "claimed",
					claimToken: token,
					claimUntil: new Date(Date.now() + 60_000),
				})
				.where(
					and(
						eq(PaymentPostCommitRecoveryTable.paymentNumber, paymentNumber),
						eq(PaymentPostCommitRecoveryTable.effect, effect),
						claimable,
					),
				)
				.returning({ token: PaymentPostCommitRecoveryTable.claimToken });
			return claimed?.token === token ? token : null;
		},

		async markPostCommitRecovery(
			paymentNumber: string,
			effect: PaymentRecoveryEffect,
			claimToken: string,
			status: "completed" | "ambiguous" | "pending",
			errorCode?: string,
		) {
			await db()
				.update(PaymentPostCommitRecoveryTable)
				.set({
					status,
					claimToken: null,
					claimUntil: null,
					attemptCount: sql`${PaymentPostCommitRecoveryTable.attemptCount} + 1`,
					lastErrorCode: errorCode ?? null,
					lastAttemptAt: new Date(),
				})
				.where(
					and(
						eq(PaymentPostCommitRecoveryTable.paymentNumber, paymentNumber),
						eq(PaymentPostCommitRecoveryTable.effect, effect),
						eq(PaymentPostCommitRecoveryTable.status, "claimed"),
						eq(PaymentPostCommitRecoveryTable.claimToken, claimToken),
					),
				);
		},

		async getPendingPostCommitRecovery(limit = 20) {
			const now = new Date();
			return await db()
				.select({
					paymentNumber: PaymentPostCommitRecoveryTable.paymentNumber,
					effect: PaymentPostCommitRecoveryTable.effect,
				})
				.from(PaymentPostCommitRecoveryTable)
				.where(
					or(
						eq(PaymentPostCommitRecoveryTable.status, "pending"),
						and(
							eq(PaymentPostCommitRecoveryTable.status, "claimed"),
							ne(
								PaymentPostCommitRecoveryTable.effect,
								"messenger_notification",
							),
							lte(PaymentPostCommitRecoveryTable.claimUntil, now),
						),
					),
				)
				.limit(limit);
		},

		async getPaymentByNumber(paymentNumber: string) {
			return await db().query.PaymentsTable.findFirst({
				where: and(
					eq(PaymentsTable.paymentNumber, paymentNumber),
					isNull(PaymentsTable.deletedAt),
				),
				with: {
					order: {
						columns: {
							orderNumber: true,
						},
					},
				},
			});
		},

		async claimTransferPaid(paymentNumber: string) {
			const [changed] = await db()
				.update(PaymentsTable)
				.set({
					status: "customer_claimed_paid",
					provider: "transfer",
					invoiceId: null,
				})
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						eq(PaymentsTable.status, "pending"),
						isNull(PaymentsTable.deletedAt),
					),
				)
				.returning({ id: PaymentsTable.id });

			if (changed) return { outcome: "changed" as const };

			const payment = await db().query.PaymentsTable.findFirst({
				where: and(
					eq(PaymentsTable.paymentNumber, paymentNumber),
					isNull(PaymentsTable.deletedAt),
				),
				columns: { status: true },
			});
			if (!payment) return { outcome: "not_found" as const };
			return match(
				paymentStates[payment.status],
				"_tag",
			)<
				| { outcome: "already_claimed" }
				| { outcome: "already_confirmed" }
				| { outcome: "refused"; status: PaymentStatusType }
			>({
				pending: () => ({ outcome: "refused", status: payment.status }),
				customer_claimed_paid: () => ({ outcome: "already_claimed" }),
				success: () => ({ outcome: "already_confirmed" }),
				failed: () => ({ outcome: "refused", status: payment.status }),
			});
		},
		async updatePaymentStatus(
			paymentNumber: string,
			status: PaymentStatusType,
		) {
			const [updated] = await db()
				.update(PaymentsTable)
				.set({ status })
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						isNull(PaymentsTable.deletedAt),
						status === "failed"
							? inArray(PaymentsTable.status, [
									"pending",
									"customer_claimed_paid",
								])
							: undefined,
					),
				)
				.returning({ status: PaymentsTable.status });
			return updated ?? null;
		},
		async createPayment(data: PaymentInsertType) {
			const result = await db().insert(PaymentsTable).values(data).returning({
				id: PaymentsTable.id,
				paymentNumber: PaymentsTable.paymentNumber,
			});
			return result[0];
		},
		async changePaymentToQpay(paymentNumber: string, invoiceId: string) {
			const [updated] = await db()
				.update(PaymentsTable)
				.set({ provider: "qpay", invoiceId })
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						eq(PaymentsTable.status, "pending"),
						isNull(PaymentsTable.deletedAt),
					),
				)
				.returning({ status: PaymentsTable.status });
			return updated ?? null;
		},
		async changePaymentToTransfer(paymentNumber: string) {
			const [updated] = await db()
				.update(PaymentsTable)
				.set({ provider: "transfer", invoiceId: null })
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						inArray(PaymentsTable.status, ["pending", "customer_claimed_paid"]),
						isNull(PaymentsTable.deletedAt),
					),
				)
				.returning({ status: PaymentsTable.status });
			return updated ?? null;
		},
	},
};
