export { adminQueries } from "~/queries/products/admin";
export { storeQueries } from "~/queries/products/store";
export * from "~/queries/products/shared";

import { adminQueries } from "~/queries/products/admin";
import { storeQueries } from "~/queries/products/store";

export const productQueries = {
	admin: adminQueries,
	store: storeQueries,
};
