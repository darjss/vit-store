import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "~/db/client";
import {
	OrderDetailsTable,
	type PaymentInsertType,
	MessengerNotificationFailuresTable,
	OrdersTable,
	PaymentsTable,
	ProductImagesTable,
	ProductsTable,
	PurchaseItemsTable,
	PurchaseReceiptItemsTable,
	SalesTable,
} from "~/db/schema";
import type { TransactionType } from "~/lib/types";
import type { paymentProvider, paymentStatus } from "~/lib/utils";

type PaymentProviderType = (typeof paymentProvider)[number];
type PaymentStatusType = (typeof paymentStatus)[number];

async function getAverageCostOfProduct(
	tx: TransactionType,
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
			const result = await db()
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
			return result[0];
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
			await db()
				.update(PaymentsTable)
				.set({ status })
				.where(eq(PaymentsTable.orderId, orderId));
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

		async confirmPayment(
			paymentNumber: string,
			provider: PaymentProviderType | undefined,
		) {
			return await this.confirmPaymentAndApplyStock(
				paymentNumber,
				provider ?? "transfer",
			);
		},

		async confirmPaymentIfPending(
			paymentNumber: string,
			provider: PaymentProviderType,
		) {
			return await this.confirmPaymentAndApplyStock(paymentNumber, provider);
		},

		async confirmPaymentAndApplyStock(
			paymentNumber: string,
			provider: PaymentProviderType,
		) {
			// D1 has no interactive transactions. To keep confirmation atomic
			// we (1) atomically claim the payment, (2) read + validate stock and
			// compute costs, then (3) apply every stock/sales/order write in a
			// single db.batch() (an implicit transaction that rolls back fully on
			// failure). If the batch throws we compensate by reverting the claim,
			// so a failed run never leaves a payment marked "success" with stock
			// unadjusted.
			const dbi = db();

			const existing = await dbi.query.PaymentsTable.findFirst({
				where: and(
					eq(PaymentsTable.paymentNumber, paymentNumber),
					inArray(PaymentsTable.status, ["pending", "customer_claimed_paid"]),
					isNull(PaymentsTable.deletedAt),
				),
				columns: { status: true, provider: true },
			});

			if (!existing) {
				return false;
			}

			const [claimedPayment] = await dbi
				.update(PaymentsTable)
				.set({ status: "success", provider })
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						inArray(PaymentsTable.status, ["pending", "customer_claimed_paid"]),
						isNull(PaymentsTable.deletedAt),
					),
				)
				.returning({ id: PaymentsTable.id, orderId: PaymentsTable.orderId });

			if (!claimedPayment) {
				// Lost the race to a concurrent confirmation.
				return false;
			}

			try {
				const orderDetails = await dbi.query.OrderDetailsTable.findMany({
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

				for (const detail of orderDetails) {
					if (
						detail.quantity <= 0 ||
						detail.product.status !== "active" ||
						detail.product.stock < detail.quantity
					) {
						throw new Error(
							`Insufficient stock for product ${detail.product.id}`,
						);
					}
				}

				const productCosts = await Promise.all(
					orderDetails.map((detail) =>
						getAverageCostOfProduct(dbi, detail.product.id, new Date()),
					),
				);

				await dbi.batch([
					// Promote the order from "created" (unpaid) to "pending" (paid,
					// awaiting shipment). Guard on status = "created" so this is a
					// no-op for legacy "pending" orders and never demotes a
					// shipped/delivered order.
					dbi
						.update(OrdersTable)
						.set({ status: "pending" })
						.where(
							and(
								eq(OrdersTable.id, claimedPayment.orderId),
								eq(OrdersTable.status, "created"),
							),
						),
					...orderDetails.flatMap((detail, index) => [
						dbi
							.update(ProductsTable)
							.set({ stock: sql`${ProductsTable.stock} - ${detail.quantity}` })
							.where(
								and(
									eq(ProductsTable.id, detail.product.id),
									eq(ProductsTable.status, "active"),
									sql`${ProductsTable.stock} >= ${detail.quantity}`,
								),
							),
						dbi.insert(SalesTable).values({
							orderId: claimedPayment.orderId,
							productId: detail.product.id,
							quantitySold: detail.quantity,
							productCost: productCosts[index],
							sellingPrice: detail.product.price,
						}),
					]),
				]);

				return true;
			} catch (error) {
				// Compensate: undo the claim so the payment isn't stranded as
				// "success" with stock/sales not applied.
				await dbi
					.update(PaymentsTable)
					.set({ status: existing.status, provider: existing.provider })
					.where(eq(PaymentsTable.id, claimedPayment.id));
				throw error;
			}
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
