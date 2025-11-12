import type { PaymentProviderType, PaymentStatusType } from "@vit/shared/types";
import { desc, eq } from "drizzle-orm";
import type { DB } from "../../db";
import { PaymentsTable } from "../../db/schema";

export function adminPayments(db: DB) {
	return {
	async createPayment(data: {
		paymentNumber: string;
		orderId: number;
		provider: PaymentProviderType;
		status: PaymentStatusType;
		amount: number;
	}) {
		const result = await db
			.insert(PaymentsTable)
			.values({
				paymentNumber: data.paymentNumber,
				orderId: data.orderId,
				provider: data.provider as PaymentProviderType,
				status: data.status as PaymentStatusType,
				amount: data.amount,
			})
			.returning({
				id: PaymentsTable.id,
				paymentNumber: PaymentsTable.paymentNumber,
			});
		return result[0];
	},

	async getPayments() {
		return db
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
			.orderBy(desc(PaymentsTable.createdAt));
	},

	async getPendingPayments() {
		return db
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
			.where(eq(PaymentsTable.status, "pending"))
			.orderBy(desc(PaymentsTable.createdAt));
	},

	async updatePaymentStatus(
		orderId: number,
		status: "pending" | "success" | "failed",
	) {
		await db
			.update(PaymentsTable)
			.set({ status })
			.where(eq(PaymentsTable.orderId, orderId));
	},
	};
}
