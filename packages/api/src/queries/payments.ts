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

export async function getAverageCostOfProduct(tx: DbOrTx, productId: number, createdAt: Date) {
	const purchaseItems = await tx.query.PurchaseItemsTable.findMany({
		where: and(eq(PurchaseItemsTable.productId, productId), isNull(PurchaseItemsTable.deletedAt)),
		with: {
			purchase: {
				columns: {
					cancelledAt: true,
					createdAt: true,
					deletedAt: true,
					orderedAt: true,
				},
			},
			receiptItems: {
				columns: {
					quantityReceived: true,
				},
				where: isNull(PurchaseReceiptItemsTable.deletedAt),
			},
		},
	});

	const totals = purchaseItems.reduce(
		(acc, item) => {
			if (item.purchase.deletedAt) {
				return acc;
			}
			const effectiveDate = item.purchase.orderedAt ?? item.purchase.createdAt;
			if (effectiveDate >= createdAt) {
				return acc;
			}

			const receivedQuantity = item.receiptItems.reduce(
				(sum, receiptItem) => sum + receiptItem.quantityReceived,
				0,
			);
			const effectiveQuantity = item.purchase.cancelledAt ? receivedQuantity : item.quantityOrdered;
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
			amount: number;
			orderId: number;
			paymentNumber: string;
			provider: PaymentProviderType;
			status: PaymentStatusType;
		}) {
			return db().transaction((tx) => this.createPaymentTx(tx, data));
		},

		async createPaymentTx(
			tx: DbOrTx,
			data: {
				amount: number;
				orderId: number;
				paymentNumber: string;
				provider: PaymentProviderType;
				status: PaymentStatusType;
			},
		) {
			const result = await tx
				.insert(PaymentsTable)
				.values({
					amount: data.amount,
					orderId: data.orderId,
					paymentNumber: data.paymentNumber,
					provider: data.provider,
					status: data.status,
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
				columns: {
					amount: true,
					createdAt: true,
					orderId: true,
					paymentNumber: true,
					updatedAt: true,
				},
				orderBy: desc(PaymentsTable.updatedAt),
				where: and(
					eq(PaymentsTable.status, "customer_claimed_paid"),
					eq(PaymentsTable.provider, "transfer"),
					isNull(PaymentsTable.deletedAt),
				),
				with: {
					order: {
						columns: {
							customerPhone: true,
							id: true,
							orderNumber: true,
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
				amount: payment.amount,
				createdAt: payment.createdAt,
				customerPhone: `${payment.order.customerPhone}`,
				orderId: payment.orderId,
				orderNumber: payment.order.orderNumber,
				paymentNumber: payment.paymentNumber,
				products: payment.order.orderDetails.map((detail) => ({
					name: detail.product.name,
					quantity: detail.quantity,
				})),
				total: payment.order.total,
				updatedAt: payment.updatedAt,
			}));
		},

		async getLatestPaymentByOrderId(orderId: number) {
			return db().query.PaymentsTable.findFirst({
				columns: {
					id: true,
					paymentNumber: true,
					provider: true,
					status: true,
				},
				orderBy: desc(PaymentsTable.createdAt),
				where: and(eq(PaymentsTable.orderId, orderId), isNull(PaymentsTable.deletedAt)),
			});
		},

		async getLatestPaymentByOrderIdTx(tx: TransactionType, orderId: number) {
			return tx.query.PaymentsTable.findFirst({
				columns: {
					id: true,
					paymentNumber: true,
					provider: true,
					status: true,
				},
				orderBy: desc(PaymentsTable.createdAt),
				where: and(eq(PaymentsTable.orderId, orderId), isNull(PaymentsTable.deletedAt)),
			});
		},

		async getPayments() {
			return db()
				.select({
					amount: PaymentsTable.amount,
					createdAt: PaymentsTable.createdAt,
					id: PaymentsTable.id,
					orderId: PaymentsTable.orderId,
					paymentNumber: PaymentsTable.paymentNumber,
					provider: PaymentsTable.provider,
					status: PaymentsTable.status,
					updatedAt: PaymentsTable.updatedAt,
				})
				.from(PaymentsTable);
		},

		async getPendingMessengerNotifications() {
			return db()
				.select({
					createdAt: MessengerNotificationFailuresTable.createdAt,
					errorCode: MessengerNotificationFailuresTable.errorCode,
					errorMessage: MessengerNotificationFailuresTable.errorMessage,
					id: MessengerNotificationFailuresTable.id,
					lastAttemptAt: MessengerNotificationFailuresTable.lastAttemptAt,
					paymentNumber: MessengerNotificationFailuresTable.paymentNumber,
					purpose: MessengerNotificationFailuresTable.purpose,
					retryCount: MessengerNotificationFailuresTable.retryCount,
					status: MessengerNotificationFailuresTable.status,
				})
				.from(MessengerNotificationFailuresTable)
				.where(eq(MessengerNotificationFailuresTable.status, "pending"));
		},

		async getPendingPayments() {
			return db()
				.select({
					amount: PaymentsTable.amount,
					createdAt: PaymentsTable.createdAt,
					id: PaymentsTable.id,
					orderId: PaymentsTable.orderId,
					paymentNumber: PaymentsTable.paymentNumber,
					provider: PaymentsTable.provider,
					status: PaymentsTable.status,
					updatedAt: PaymentsTable.updatedAt,
				})
				.from(PaymentsTable)
				.where(eq(PaymentsTable.status, "pending"));
		},

		async updatePaymentStatus(orderId: number, status: PaymentStatusType) {
			const latest = await db().query.PaymentsTable.findFirst({
				columns: { id: true },
				orderBy: desc(PaymentsTable.createdAt),
				where: and(eq(PaymentsTable.orderId, orderId), isNull(PaymentsTable.deletedAt)),
			});
			if (!latest) {
				return;
			}
			await db().update(PaymentsTable).set({ status }).where(eq(PaymentsTable.id, latest.id));
		},

		async updatePaymentStatusTx(tx: TransactionType, orderId: number, status: PaymentStatusType) {
			const latest = await tx.query.PaymentsTable.findFirst({
				columns: { id: true },
				orderBy: desc(PaymentsTable.createdAt),
				where: and(eq(PaymentsTable.orderId, orderId), isNull(PaymentsTable.deletedAt)),
			});
			if (!latest) {
				return;
			}
			await tx.update(PaymentsTable).set({ status }).where(eq(PaymentsTable.id, latest.id));
			if (status === "success") {
				const payment = await tx.query.PaymentsTable.findFirst({
					columns: { paymentNumber: true },
					where: eq(PaymentsTable.id, latest.id),
				});
				if (payment) {
					await tx
						.insert(PaymentNotificationOutboxTable)
						.values({
							paymentNumber: payment.paymentNumber,
							purpose: "order_payment_confirmed_sms",
						})
						.onConflictDoNothing();
				}
			}
		},
	},

	store: {
		async changePaymentToQpay(paymentNumber: string, invoiceId: string) {
			await db()
				.update(PaymentsTable)
				.set({
					invoiceId,
					provider: sql<PaymentProviderType>`case
						when ${PaymentsTable.status} = 'success' then ${PaymentsTable.provider}
						else 'qpay'
					end`,
				})
				.where(eq(PaymentsTable.paymentNumber, paymentNumber));
		},

		async changePaymentToTransfer(paymentNumber: string) {
			await db()
				.update(PaymentsTable)
				.set({ provider: "transfer" })
				.where(eq(PaymentsTable.paymentNumber, paymentNumber));
		},

		async claimTransferPaid(paymentNumber: string) {
			const [changed] = await db()
				.update(PaymentsTable)
				.set({ status: "customer_claimed_paid" })
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						eq(PaymentsTable.status, "pending"),
						isNull(PaymentsTable.deletedAt),
					),
				)
				.returning({ id: PaymentsTable.id });

			if (changed) {
				return { outcome: "changed" as const };
			}

			const payment = await db().query.PaymentsTable.findFirst({
				columns: { status: true },
				where: and(eq(PaymentsTable.paymentNumber, paymentNumber), isNull(PaymentsTable.deletedAt)),
			});
			if (!payment) {
				throw new Error("Payment not found");
			}
			if (payment.status === "customer_claimed_paid") {
				return { outcome: "already_claimed" as const };
			}
			if (payment.status === "success") {
				return { outcome: "already_confirmed" as const };
			}
			return { outcome: "refused" as const };
		},

		async confirmPaymentAndApplyStock(
			paymentNumber: string,
			provider: PaymentProviderType,
			consumedKhaanTransactions?: Array<{ fingerprint: string }>,
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
					.set({ provider, status: "success" })
					.where(
						and(
							eq(PaymentsTable.paymentNumber, paymentNumber),
							inArray(PaymentsTable.status, ["pending", "customer_claimed_paid"]),
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
						delta: -detail.quantity,
						productId: detail.product.id,
						requireActive: true,
						requireNonNegative: true,
					});

					if (!updatedProduct) {
						throw new Error(`Insufficient stock for product ${detail.product.id}`);
					}

					const productCost = await getAverageCostOfProduct(tx, detail.product.id, new Date());

					await tx.insert(SalesTable).values({
						orderId: claimedPayment.orderId,
						productCost,
						productId: detail.product.id,
						quantitySold: detail.quantity,
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
						and(eq(OrdersTable.id, claimedPayment.orderId), eq(OrdersTable.status, "created")),
					);

				return true;
			});

			return confirmed;
		},

		async createPayment(data: PaymentInsertType) {
			const result = await db().insert(PaymentsTable).values(data).returning({
				id: PaymentsTable.id,
				paymentNumber: PaymentsTable.paymentNumber,
			});
			return result[0];
		},
		async getConsumedKhaanFingerprints(fingerprints: Array<string>): Promise<Set<string>> {
			if (fingerprints.length === 0) {
				return new Set();
			}
			const rows = await db()
				.select({ fingerprint: KhaanConsumedTransactionsTable.fingerprint })
				.from(KhaanConsumedTransactionsTable)
				.where(inArray(KhaanConsumedTransactionsTable.fingerprint, fingerprints));
			return new Set(rows.map((row) => row.fingerprint));
		},
		async getPaymentByNumber(paymentNumber: string) {
			return await db().query.PaymentsTable.findFirst({
				where: and(eq(PaymentsTable.paymentNumber, paymentNumber), isNull(PaymentsTable.deletedAt)),
				with: {
					order: {
						columns: {
							orderNumber: true,
						},
					},
				},
			});
		},
		async getPaymentInfoByNumber(paymentNumber: string) {
			return db().query.PaymentsTable.findFirst({
				where: and(eq(PaymentsTable.paymentNumber, paymentNumber), isNull(PaymentsTable.deletedAt)),
				with: {
					order: {
						columns: {
							address: true,
							createdAt: true,
							customerPhone: true,
							id: true,
							notes: true,
							orderNumber: true,
							status: true,
							total: true,
						},
						with: {
							orderDetails: {
								columns: {
									price: true,
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
											brand: {
												columns: {
													name: true,
												},
											},
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
		async storeQpayInvoice(paymentNumber: string, invoiceId: string) {
			await db()
				.update(PaymentsTable)
				.set({ invoiceId })
				.where(eq(PaymentsTable.paymentNumber, paymentNumber));
		},
		async updatePaymentStatus(paymentNumber: string, status: PaymentStatusType) {
			await db()
				.update(PaymentsTable)
				.set({ status })
				.where(eq(PaymentsTable.paymentNumber, paymentNumber));
		},
	},
};
