import { and, eq, getTableColumns, gte, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import { CustomersTable } from "../db/schema";

export const customerQueries = {
	admin: {
		async createCustomer(data: { phone: number; address?: string }) {
			const result = await db()
				.insert(CustomersTable)
				.values(data)
				.returning({ phone: CustomersTable.phone });
			return result;
		},

		async getCustomerByPhone(phone: number) {
			const result = await db()
				.select(getTableColumns(CustomersTable))
				.from(CustomersTable)
				.where(
					and(
						eq(CustomersTable.phone, phone),
						isNull(CustomersTable.deletedAt),
					),
				)
				.limit(1);
			return result[0] || null;
		},

		async getCustomerCount() {
			const result = await db()
				.select({
					count: sql<number>`COUNT(*)`,
				})
				.from(CustomersTable)
				.where(isNull(CustomersTable.deletedAt));
			return result[0]?.count || 0;
		},

		async getNewCustomersCount(startDate: Date) {
			const result = await db()
				.select({
					count: sql<number>`COUNT(*)`,
				})
				.from(CustomersTable)
				.where(gte(CustomersTable.createdAt, startDate))
				.limit(1);
			return result[0]?.count ?? 0;
		},

		async getAllCustomers() {
			return db()
				.select(getTableColumns(CustomersTable))
				.from(CustomersTable)
				.where(isNull(CustomersTable.deletedAt))
				.orderBy(CustomersTable.createdAt);
		},

		async updateCustomer(phone: number, data: { address?: string }) {
			const result = await db()
				.update(CustomersTable)
				.set(data)
				.where(
					and(
						eq(CustomersTable.phone, phone),
						isNull(CustomersTable.deletedAt),
					),
				)
				.returning({ phone: CustomersTable.phone });
			return result[0] || null;
		},

		async deleteCustomer(phone: number) {
			await db()
				.update(CustomersTable)
				.set({ deletedAt: new Date() })
				.where(
					and(
						eq(CustomersTable.phone, phone),
						isNull(CustomersTable.deletedAt),
					),
				);
		},
	},

	store: {
		async getCustomerByPhone(phone: number) {
			return db().query.CustomersTable.findFirst({
				where: eq(CustomersTable.phone, phone),
			});
		},

		async createCustomer(data: { phone: number; address?: string }) {
			const result = await db().insert(CustomersTable).values(data).returning();
			return result[0];
		},

		async updateCustomerAddress(
			phone: number,
			address: string | null | undefined,
		) {
			if (address === undefined || address === null) return;
			await db()
				.update(CustomersTable)
				.set({ address })
				.where(eq(CustomersTable.phone, phone));
		},
	},
};
