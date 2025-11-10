import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import {
	PaymentsTable,
	ProductImagesTable,
} from "../../db/schema";
import { PaymentProviderType, PaymentStatusType } from "../../lib/types";

export const storePayments = {
	async getPaymentInfoByNumber(paymentNumber: string) {
		return db.query.PaymentsTable.findFirst({
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
	async confirmPayment(paymentNumber: string, provider?: PaymentProviderType) {
			await db.update(PaymentsTable).set({ status: "success", provider: provider ?? "transfer" }).where(eq(PaymentsTable.paymentNumber, paymentNumber));
			
	},
	async getPaymentByNumber(paymentNumber: string) {
		return db.query.PaymentsTable.findFirst({
			where: and(
				eq(PaymentsTable.paymentNumber, paymentNumber),
				isNull(PaymentsTable.deletedAt),
			),
		});
	},
	async updatePaymentStatus(paymentNumber: string, status: PaymentStatusType) {
		await db.update(PaymentsTable).set({ status }).where(eq(PaymentsTable.paymentNumber, paymentNumber));
	},
};

