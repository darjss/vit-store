import type { DB } from "../db";

import { analyticsQueries } from "./analytics";
import { brandQueries } from "./brands";
import { categoryQueries } from "./categories";
import { customerQueries } from "./customers";
import { orderQueries } from "./orders";
import { paymentQueries } from "./payments";
import { productImageQueries } from "./product-images";
import { productQueries } from "./products";
import { purchaseQueries } from "./purchases";
import { salesQueries } from "./sales";
import { userQueries } from "./users";

export {
	analyticsQueries,
	brandQueries,
	categoryQueries,
	customerQueries,
	orderQueries,
	paymentQueries,
	productImageQueries,
	productQueries,
	purchaseQueries,
	salesQueries,
	userQueries,
};

/**
 * Create all queries for a given database instance
 * Usage: const q = createQueries(db)
 *        q.products.admin.getAll()
 *        q.products.store.getById(1)
 */
export function createQueries(db: DB) {
	return {
		analytics: analyticsQueries(db),
		brands: brandQueries(db),
		categories: categoryQueries(db),
		customers: customerQueries(db),
		orders: orderQueries(db),
		payments: paymentQueries(db),
		productImages: productImageQueries(db),
		products: productQueries(db),
		purchases: purchaseQueries(db),
		sales: salesQueries(db),
		users: userQueries(db),
	} as const;
}
