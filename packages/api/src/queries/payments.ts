import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/db/client";
import {
	KhaanConsumedTransactionsTable,
	MessengerNotificationFailuresTable,
	OrderDetailsTable,
	OrdersTable,
	type PaymentInsertType,
	PaymentNotificationOutboxTable,
	PaymentsTable,
	ProductImagesTable,
	PurchaseItemsTable,
	PurchaseReceiptItemsTable,
	SalesTable,
} from "~/db/schema";
import { recordConsumedKhaanTransaction } from "~/lib/payments/consumed-transaction";
import { applyStockTransition } from "~/lib/stock/transition";
import type { TransactionType } from "~/lib/types";
import type { paymentProvider, paymentStatus } from "~/lib/utils";

type PaymentProviderType = (typeof paymentProvider)[number];
type PaymentStatusType = (typeof paymentStatus)[number];

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
					errorMessage: MessengerNotificationFailuresTable.errorMessage,
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
		) {
			const confirmed = await db().transaction(async (tx) => {
				// Record consumed Khaan fingerprints BEFORE the status flip and
				// regardless of whether THIS call wins the flip. A concurrent
				// admin confirm may flip status→success first, causing the UPDATE
				// below to claim 0 rows; the fingerprint must still be recorded so
				// the bank transaction cannot be replayed against a later order.
				// recordConsumedKhaanTransaction is idempotent for the same
				// paymentNumber and throws KhaanTransactionAlreadyConsumedError
				// (aborting this tx) when a DIFFERENT payment already consumed it.
				if (consumedKhaanTransactions?.length) {
					for (const { fingerprint } of consumedKhaanTransactions) {
						await recordConsumedKhaanTransaction(tx, {
							fingerprint,
							paymentNumber,
						});
					}
				}
				const [claimedPayment] = await tx
					.update(PaymentsTable)
					.set({ status: "success", provider })
					.where(
						and(
							eq(PaymentsTable.paymentNumber, paymentNumber),
							inArray(PaymentsTable.status, [
								"pending",
								"customer_claimed_paid",
							]),
							isNull(PaymentsTable.deletedAt),
						),
					)
					.returning({ id: PaymentsTable.id, orderId: PaymentsTable.orderId });

				if (!claimedPayment) {
					return false;
				}
				await tx
					.insert(PaymentNotificationOutboxTable)
					.values({
						paymentNumber,
						purpose: "order_payment_confirmed_sms",
					})
					.onConflictDoNothing();

				const orderDetails = await tx.query.OrderDetailsTable.findMany({
					where: and(
						eq(OrderDetailsTable.orderId, claimedPayment.orderId),
						isNull(OrderDetailsTable.deletedAt),
					),
					with: {
						product: {
							columns: {
								id: true,
								price: true,
								status: true,
								stock: true,
							},
						},
					},
				});

				// Stock is decremented by the conditional UPDATE below, which is
				// the real guard (it re-checks status = active AND stock >=
				// quantity atomically). A non-locked pre-check here would only
				// give an earlier error for impossible inputs and cannot prevent
				// races, so it is intentionally omitted (F6).
				for (const detail of orderDetails) {
					const updatedProduct = await applyStockTransition(tx, {
						productId: detail.product.id,
						delta: -detail.quantity,
						requireActive: true,
						requireNonNegative: true,
					});

					if (!updatedProduct) {
						throw new Error(
							`Insufficient stock for product ${detail.product.id}`,
						);
					}

					const productCost = await getAverageCostOfProduct(
						tx,
						detail.product.id,
						new Date(),
					);

					await tx.insert(SalesTable).values({
						orderId: claimedPayment.orderId,
						productId: detail.product.id,
						quantitySold: detail.quantity,
						productCost,
						sellingPrice: detail.price ?? detail.product.price,
					});
				}

				// Payment confirmed — promote the order from "created" (unpaid)
				// to "pending" (paid, awaiting shipment). Guard on current status
				// = "created" so this is a no-op for legacy "pending" orders and
				// never accidentally demotes a shipped/delivered order.
				await tx
					.update(OrdersTable)
					.set({ status: "pending" })
					.where(
						and(
							eq(OrdersTable.id, claimedPayment.orderId),
							eq(OrdersTable.status, "created"),
						),
					);

				return true;
			});

			return confirmed;
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

		async updatePaymentStatus(
			paymentNumber: string,
			status: PaymentStatusType,
		) {
			await db()
				.update(PaymentsTable)
				.set({ status })
				.where(eq(PaymentsTable.paymentNumber, paymentNumber));
		},
		async createPayment(data: PaymentInsertType) {
			const result = await db().insert(PaymentsTable).values(data).returning({
				id: PaymentsTable.id,
				paymentNumber: PaymentsTable.paymentNumber,
			});
			return result[0];
		},
		async changePaymentToQpay(paymentNumber: string, invoiceId: string) {
			await db()
				.update(PaymentsTable)
				.set({ provider: "qpay", invoiceId: invoiceId })
				.where(eq(PaymentsTable.paymentNumber, paymentNumber));
		},
		async changePaymentToTransfer(paymentNumber: string) {
			await db()
				.update(PaymentsTable)
				.set({ provider: "transfer", invoiceId: null })
				.where(eq(PaymentsTable.paymentNumber, paymentNumber));
		},
	},
};
