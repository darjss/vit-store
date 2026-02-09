import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import {
	type PaymentInsertType,
	PaymentsTable,
	ProductImagesTable,
} from "../db/schema";
import type { paymentProvider, paymentStatus } from "../lib/constants";

type PaymentProviderType = (typeof paymentProvider)[number];
type PaymentStatusType = (typeof paymentStatus)[number];

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
			await db()
				.update(PaymentsTable)
				.set({ status: "success", provider: provider ?? "transfer" })
				.where(eq(PaymentsTable.paymentNumber, paymentNumber));
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
	},
};
