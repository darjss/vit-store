import { eq } from "drizzle-orm";
import { db } from "../../db";
import { CustomersTable } from "../../db/schema";

export const storeCustomers = {
	async getCustomerByPhone(phone: number) {
		return db.query.CustomersTable.findFirst({
			where: eq(CustomersTable.phone, phone),
		});
	},

	async createCustomer(data: { phone: number; address?: string }) {
		const result = await db
			.insert(CustomersTable)
			.values(data)
			.returning();
		return result[0];
	},

	async updateCustomerAddress(phone: number, address: string | null | undefined) {
		if (address === undefined || address === null) return;
		await db
			.update(CustomersTable)
			.set({ address })
			.where(eq(CustomersTable.phone, phone));
	},
};

