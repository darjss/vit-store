import { eq, inArray, sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";

import { reset as drizzleReset, seed as drizzleSeed } from "drizzle-seed";
import type * as schema from "@/db/schema";
import {
	BrandsTable,
	CategoriesTable,
	CustomersTable,
	OrderDetailsTable,
	OrdersTable,
	PaymentsTable,
	ProductImagesTable,
	ProductsTable,
	PurchasesTable,
	SalesTable,
} from "@/db/schema";

// constants not needed; using explicit arrays in refinements to keep this self-contained

type Database = DrizzleD1Database<typeof schema>;

type SeedOptions = {
	reset?: boolean;
	rngSeed?: number;
};

class DeterministicRng {
	private state: number;
	constructor(seed = 1337) {
		// Xorshift32
		this.state = seed >>> 0;
		if (this.state === 0) this.state = 0x9e3779b9;
	}
	int() {
		let x = this.state;
		x ^= x << 13;
		x ^= x >>> 17;
		x ^= x << 5;
		this.state = x >>> 0;
		return this.state;
	}
	float() {
		return this.int() / 0xffffffff;
	}
	intInRange(min: number, max: number) {
		return Math.floor(this.float() * (max - min + 1)) + min;
	}
}

const BRANDS: Array<schema.BrandInsertType> = [
	{ name: "NOW Foods", logoUrl: "https://picsum.photos/600/400?random=26" },
	{ name: "Nature's Best", logoUrl: "https://picsum.photos/600/400?random=27" },
	{
		name: "Microingredients",
		logoUrl: "https://picsum.photos/600/400?random=28",
	},
	{ name: "NutriCost", logoUrl: "https://picsum.photos/600/400?random=28" },
	{ name: "Doctor's Best", logoUrl: "https://picsum.photos/600/400?random=29" },
];

const CATEGORIES: Array<string> = [
	"Vitamins",
	"Minerals",
	"Herbal",
	"Proteins",
	"Omega & Oils",
	"Probiotics",
];

export type SeedSummary = {
	brands: number;
	categories: number;
	products: number;
	productImages: number;
	customers: number;
	orders: number;
	orderDetails: number;
	payments: number;
	purchases: number;
	sales: number;
};

async function resetData(db: Database) {
	// Reset only the seedable tables (do not touch users or carts/cart items)
	await drizzleReset(db as any, {
		brands: BrandsTable,
		categories: CategoriesTable,
		products: ProductsTable,
		productImages: ProductImagesTable,
		customers: CustomersTable,
		orders: OrdersTable,
		orderDetails: OrderDetailsTable,
		payments: PaymentsTable,
		purchases: PurchasesTable,
		sales: SalesTable,
	});
}

export async function seedDatabase(db: Database, options: SeedOptions = {}) {
	const rng = new DeterministicRng(options.rngSeed ?? 1337);
	if (options.reset) {
		await resetData(db);
	}

	// 1) Brands via drizzle-seed
	await drizzleSeed(db as any, { brands: BrandsTable }).refine((f) => ({
		brands: {
			count: BRANDS.length,
			columns: {
				name: f.valuesFromArray({
					values: BRANDS.map((b) => b.name),
					isUnique: true,
				}),
				logoUrl: f.valuesFromArray({ values: BRANDS.map((b) => b.logoUrl) }),
			},
		},
	}));

	const brandRows = await db.select({ id: BrandsTable.id }).from(BrandsTable);
	const brandIds = brandRows.map((b) => b.id);

	// 2) Categories via drizzle-seed
	await drizzleSeed(db as any, { categories: CategoriesTable }).refine((f) => ({
		categories: {
			count: CATEGORIES.length,
			columns: {
				name: f.valuesFromArray({ values: CATEGORIES, isUnique: true }),
			},
		},
	}));
	const categoryRows = await db
		.select({ id: CategoriesTable.id })
		.from(CategoriesTable);
	const categoryIds = categoryRows.map((c) => c.id);

	// 3) Products with images via drizzle-seed
	const productCount = 40;
	const productNames = Array.from(
		{ length: productCount },
		(_, i) => `Product ${i + 1}`,
	);
	const productSlugs = Array.from(
		{ length: productCount },
		(_, i) => `product-${i + 1}-${rng.intInRange(1000, 9999)}`,
	);
	const amountOptions = [
		"30 caps",
		"60 caps",
		"90 caps",
		"120 caps",
		"180 caps",
	];
	const potencyOptions = [
		"250mg",
		"500mg",
		"750mg",
		"1000mg",
		"1500mg",
		"2000mg",
	];
	await drizzleSeed(db as any, {
		products: ProductsTable,
		productImages: ProductImagesTable,
	}).refine((f) => ({
		products: {
			count: productCount,
			columns: {
				name: f.valuesFromArray({ values: productNames, isUnique: true }),
				slug: f.valuesFromArray({ values: productSlugs, isUnique: true }),
				description: f.loremIpsum(),
				status: f.valuesFromArray({
					values: ["active", "draft", "out_of_stock"],
				}),
				discount: f.int({ minValue: 0, maxValue: 30 }),
				amount: f.valuesFromArray({ values: amountOptions }),
				potency: f.valuesFromArray({ values: potencyOptions }),
				stock: f.int({ minValue: 0, maxValue: 250 }),
				price: f.int({ minValue: 1000, maxValue: 20000 }),
				dailyIntake: f.int({ minValue: 1, maxValue: 3 }),
				categoryId: f.valuesFromArray({ values: categoryIds }),
				brandId: f.valuesFromArray({ values: brandIds }),
			},
			with: {
				productImages: 3,
			},
		},
		productImages: {
			columns: {
				url: f.valuesFromArray({
					values: [
						"https://picsum.photos/800/600?random=1",
						"https://picsum.photos/800/600?random=2",
						"https://picsum.photos/800/600?random=3",
						"https://picsum.photos/800/600?random=4",
						"https://picsum.photos/800/600?random=5",
						"https://picsum.photos/800/600?random=6",
						"https://picsum.photos/800/600?random=7",
						"https://picsum.photos/800/600?random=8",
						"https://picsum.photos/800/600?random=9",
						"https://picsum.photos/800/600?random=10",
					],
				}),
				isPrimary: f.int({ minValue: 0, maxValue: 1 }),
			},
		},
	}));

	// Ensure one primary image per product (post-process)
	await db.run(sql`UPDATE ecom_vit_product_image SET is_primary = 0`);
	await db.run(
		sql`UPDATE ecom_vit_product_image SET is_primary = 1 WHERE id IN (SELECT MIN(id) FROM ecom_vit_product_image GROUP BY product_id)`,
	);

	const productRows = await db
		.select({ id: ProductsTable.id })
		.from(ProductsTable);
	const productIds = productRows.map((p) => p.id);

	// 4) Customers via drizzle-seed
	await drizzleSeed(db as any, { customers: CustomersTable }).refine((f) => ({
		customers: {
			count: 50,
			columns: {
				phone: f.int({
					minValue: 80000000,
					maxValue: 99999999,
					isUnique: true,
				}),
				address: f.streetAddress(),
			},
		},
	}));

	const customerRows = await db
		.select({ phone: CustomersTable.phone })
		.from(CustomersTable);
	const customerPhones = customerRows.map((c) => c.phone);

	// 5) Orders, Details, Payments via drizzle-seed
	const now = new Date();
	const minDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
	const minISO = minDate.toISOString();
	const maxISO = now.toISOString();
	const orderCount = 100;
	const orderNumbers = Array.from({ length: orderCount }, () => {
		const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
		let s = "";
		for (let i = 0; i < 8; i++)
			s += alphabet.charAt(rng.intInRange(0, alphabet.length - 1));
		return s;
	});

	await drizzleSeed(db as any, {
		orders: OrdersTable,
		orderDetails: OrderDetailsTable,
		payments: PaymentsTable,
	}).refine((f) => ({
		orders: {
			count: orderCount,
			columns: {
				orderNumber: f.valuesFromArray({
					values: orderNumbers,
					isUnique: true,
				}),
				customerPhone: f.valuesFromArray({ values: customerPhones }),
				status: f.valuesFromArray({
					values: ["pending", "shipped", "delivered", "cancelled", "refunded"],
				}),
				address: f.streetAddress(),
				deliveryProvider: f.valuesFromArray({
					values: ["tu-delivery", "self", "avidaa"],
				}),
				total: f.int({ minValue: 5000, maxValue: 200000 }),
				createdAt: f.date({ minDate: minISO, maxDate: maxISO }),
			},
			with: {
				orderDetails: 3,
				payments: 1,
			},
		},
		orderDetails: {
			columns: {
				productId: f.valuesFromArray({ values: productIds }),
				quantity: f.int({ minValue: 1, maxValue: 5 }),
			},
		},
		payments: {
			columns: {
				provider: f.valuesFromArray({ values: ["qpay", "transfer", "cash"] }),
				status: f.valuesFromArray({ values: ["pending", "success", "failed"] }),
				createdAt: f.date({ minDate: minISO, maxDate: maxISO }),
			},
		},
	}));

	// Enforce business rules for payment status
	await db.run(
		sql`UPDATE ecom_vit_payment SET status = 'success' WHERE order_id IN (SELECT id FROM ecom_vit_order WHERE status = 'delivered')`,
	);
	await db.run(
		sql`UPDATE ecom_vit_payment SET status = 'failed' WHERE order_id IN (SELECT id FROM ecom_vit_order WHERE status IN ('cancelled','refunded'))`,
	);

	// Recalculate order totals from details and products
	await db.run(sql`
		UPDATE ecom_vit_order
		SET total = (
			SELECT COALESCE(SUM(od.quantity * CAST(p.price * (1 - (p.discount / 100.0)) AS INT)), 0)
			FROM ecom_vit_order_detail od
			JOIN ecom_vit_product p ON p.id = od.product_id
			WHERE od.order_id = ecom_vit_order.id
		)
	`);

	// 6) Purchases via drizzle-seed
	await drizzleSeed(db as any, { purchases: PurchasesTable }).refine((f) => ({
		purchases: {
			count: 80,
			columns: {
				productId: f.valuesFromArray({ values: productIds }),
				quantityPurchased: f.int({ minValue: 5, maxValue: 100 }),
				unitCost: f.int({ minValue: 300, maxValue: 20000 }),
				createdAt: f.date({ minDate: minISO, maxDate: maxISO }),
			},
		},
	}));

	// 7) Sales derived from delivered orders
	const deliveredOrderRows = await db
		.select({ id: OrdersTable.id })
		.from(OrdersTable)
		.where(eq(OrdersTable.status, "delivered"));
	const deliveredOrderIds = deliveredOrderRows.map((o) => o.id);
	if (deliveredOrderIds.length > 0) {
		const detailRows = await db
			.select({
				orderId: OrderDetailsTable.orderId,
				productId: OrderDetailsTable.productId,
				quantity: OrderDetailsTable.quantity,
				price: ProductsTable.price,
				discount: ProductsTable.discount,
			})
			.from(OrderDetailsTable)
			.innerJoin(
				ProductsTable,
				eq(OrderDetailsTable.productId, ProductsTable.id),
			)
			.where(inArray(OrderDetailsTable.orderId, deliveredOrderIds));

		const salesRows: Array<schema.SalesInsertType> = detailRows.map((d) => {
			const sellingPrice = Math.max(
				1,
				Math.floor(d.price * (1 - (d.discount ?? 0) / 100)),
			);
			const productCost = Math.max(1, Math.floor(d.price * 0.6));
			return {
				productId: d.productId,
				orderId: d.orderId,
				quantitySold: d.quantity,
				productCost,
				sellingPrice,
			};
		});
		if (salesRows.length > 0) {
			await db.insert(SalesTable).values(salesRows).run();
		}
	}

	// Build summary
	const getCount = async (tbl: unknown) => {
		const rows = await db.select({ c: sql<number>`count(*)` }).from(tbl as any);
		return (rows?.[0]?.c as number) ?? 0;
	};

	const summary: SeedSummary = {
		brands: await getCount(BrandsTable),
		categories: await getCount(CategoriesTable),
		products: await getCount(ProductsTable),
		productImages: await getCount(ProductImagesTable),
		customers: await getCount(CustomersTable),
		orders: await getCount(OrdersTable),
		orderDetails: await getCount(OrderDetailsTable),
		payments: await getCount(PaymentsTable),
		purchases: await getCount(PurchasesTable),
		sales: await getCount(SalesTable),
	};

	return { message: "Seed completed", summary } as const;
}

export default seedDatabase;
