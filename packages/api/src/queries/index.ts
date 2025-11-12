import type { DB } from "../db";
import { adminAnalytics } from "./admin/analytics";
import { adminBrands } from "./admin/brands";
import { adminCategories } from "./admin/categories";
import { adminCustomers } from "./admin/customers";
import { adminOrders } from "./admin/orders";
import { adminPayments } from "./admin/payments";
import { adminProductImages } from "./admin/product-images";
import { adminProducts } from "./admin/products";
import { adminPurchases } from "./admin/purchases";
import { adminSales } from "./admin/sales";
import { adminUsers } from "./admin/users";
import { storeBrands } from "./store/brands";
import { storeCustomers } from "./store/customers";
import { storeOrders } from "./store/orders";
import { storePayments } from "./store/payments";
import { storeProducts } from "./store/products";

export function adminQueries(db: DB) {
	return {
		...adminAnalytics(db),
		...adminCustomers(db),
		...adminProducts(db),
		...adminPurchases(db),
		...adminPayments(db),
		...adminBrands(db),
		...adminUsers(db),
		...adminSales(db),
		...adminOrders(db),
		...adminCategories(db),
		...adminProductImages(db),
	} as const;
}

export function storeQueries(db: DB) {
	return {
		...storeOrders(db),
		...storeProducts(db),
		...storePayments(db),
		...storeBrands(db),
		...storeCustomers(db),
	} as const;
}

// Legacy export for backwards compatibility - deprecated, use factory functions instead
export const QUERIES = {
	store: storeQueries,
	admin: adminQueries,
} as const;

