import { createUpdateSchema } from "drizzle-valibot";
import { CustomersTable } from "~/db/schema";
export const updateCustomerSchema = createUpdateSchema(CustomersTable);
