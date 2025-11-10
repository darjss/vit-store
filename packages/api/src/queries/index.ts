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

export const adminQueries = {
	...adminAnalytics,
	...adminCustomers,
	...adminProducts,
	...adminPurchases,
	...adminPayments,
	...adminBrands,
	...adminUsers,
	...adminSales,
	...adminOrders,
	...adminCategories,
	...adminProductImages,
} as const;

export const storeQueries = {
	...storeOrders,
	...storeProducts,
	...storePayments,
	...storeBrands,
	...storeCustomers,
} as const;

// Legacy export for backwards compatibility
export const QUERIES = {
	store: storeQueries,
	admin: adminQueries,
} as const;

