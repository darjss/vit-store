import { createUpdateSchema } from "drizzle-valibot";
import { CustomersTable } from "./schema";
export const updateCustomerSchema = createUpdateSchema(CustomersTable);
