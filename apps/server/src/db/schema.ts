import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { relations, sql } from "drizzle-orm";
import { index, int, sqliteTableCreator, text } from "drizzle-orm/sqlite-core";
import {
	deliveryProvider,
	orderStatus,
	paymentProvider,
	paymentStatus,
	status,
} from "@/lib/constants";

export const createTable = sqliteTableCreator((name) => `ecom_vit_${name}`);

export const UsersTable = createTable(
	"user",
	{
		id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
		username: text("username", { length: 256 }).notNull(),
		googleId: text("google_id", { length: 256 }).unique(),
		isApproved: int("is_approved", { mode: "boolean" })
			.default(false)
			.notNull(),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("username_idx").on(table.username),
		index("google_id_idx").on(table.googleId),
		index("user_created_at_idx").on(table.createdAt),
		index("user_deleted_at_idx").on(table.deletedAt),
	],
);

export const CustomersTable = createTable(
	"customer",
	{
		phone: int("phone", { mode: "number" }).notNull().unique().primaryKey(),
		address: text("address", { length: 256 }),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("phone_idx").on(table.phone),
		index("customer_created_at_idx").on(table.createdAt),
		index("customer_deleted_at_idx").on(table.deletedAt),
	],
);

export const BrandsTable = createTable(
	"brand",
	{
		id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
		name: text("name", { length: 256 }).notNull().unique(),
		logoUrl: text("logo_url", { length: 512 }).notNull(),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("brand_name_idx").on(table.name),
		index("brand_created_at_idx").on(table.createdAt),
		index("brand_deleted_at_idx").on(table.deletedAt),
	],
);

export const CategoriesTable = createTable(
	"category",
	{
		id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
		name: text("name", { length: 256 }).notNull().unique(),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("category_name_idx").on(table.name),
		index("category_created_at_idx").on(table.createdAt),
		index("category_deleted_at_idx").on(table.deletedAt),
	],
);

export const ProductsTable = createTable(
	"product",
	{
		id: int("id", { mode: "number" })
			.primaryKey({ autoIncrement: true })
			.notNull(),
		name: text("name", { length: 256 }).notNull(),
		slug: text("slug", { length: 256 }).notNull(),
		description: text("description").notNull(),
		status: text("status", { enum: status }).default("draft").notNull(),
		discount: int("discount", { mode: "number" }).default(0).notNull(),
		amount: text("amount", { length: 15 }).notNull(),
		potency: text("potency", { length: 10 }).notNull(),
		stock: int("stock", { mode: "number" }).default(0).notNull(),
		price: int("price", { mode: "number" }).notNull(),
		dailyIntake: int("daily_intake", { mode: "number" }).default(0).notNull(),
		categoryId: int("category_id", { mode: "number" })
			.references(() => CategoriesTable.id)
			.notNull(),
		brandId: int("brand_id", { mode: "number" })
			.references(() => BrandsTable.id)
			.notNull(),
		tags: text("tags", { mode: "json" })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		isFeatured: int("is_featured", { mode: "boolean" })
			.default(sql`0`)
			.notNull(),
		ingredients: text("ingredients", { mode: "json" }).$type<string[] | null>(),
		seoTitle: text("seo_title", { length: 256 }),
		seoDescription: text("seo_description", { length: 512 }),
		minStock: int("min_stock", { mode: "number" }).default(0).notNull(),
		weightGrams: int("weight_grams", { mode: "number" }).default(0).notNull(),
		originCountry: text("origin_country", { length: 3 }),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("product_id_idx").on(table.id),
		index("product_name_idx").on(table.name),
		index("product_status_idx").on(table.status),
		index("product_category_idx").on(table.categoryId),
		index("product_brand_idx").on(table.brandId),
		index("product_stock_idx").on(table.stock),
		index("product_price_idx").on(table.price),
		index("product_created_at_idx").on(table.createdAt),
		index("product_deleted_at_idx").on(table.deletedAt),
		index("product_is_featured_idx").on(table.isFeatured),
	],
);

export const ProductImagesTable = createTable(
	"product_image",
	{
		id: int("id", { mode: "number" })
			.primaryKey({ autoIncrement: true })
			.notNull(),
		productId: int("product_id", { mode: "number" })
			.references(() => ProductsTable.id, { onDelete: "cascade" })
			.notNull(),
		url: text("url", { length: 512 }).notNull(),
		isPrimary: int("is_primary", { mode: "boolean" }).default(sql`0`).notNull(),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("image_product_idx").on(table.productId),
		index("image_product_primary_idx").on(table.productId, table.isPrimary),
		index("image_deleted_at_idx").on(table.deletedAt),
	],
);

export const OrdersTable = createTable(
	"order",
	{
		id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
		orderNumber: text("order_number", { length: 8 }).notNull(),
		customerPhone: int("customer_phone", { mode: "number" })
			.references(() => CustomersTable.phone)
			.notNull(),
		status: text("status", {
			enum: orderStatus,
		}).notNull(),
		address: text("address", { length: 256 }).notNull(),
		deliveryProvider: text("delivery_provider", {
			enum: deliveryProvider,
		}).notNull(),
		total: int("total", { mode: "number" }).notNull(),
		notes: text("notes"),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("order_id_idx").on(table.id),
		index("order_customer_idx").on(table.customerPhone),
		index("order_number_idx").on(table.orderNumber),
		index("order_status_idx").on(table.status),
		index("order_created_at_idx").on(table.createdAt),
		index("order_deleted_at_idx").on(table.deletedAt),
	],
);

export const OrderDetailsTable = createTable(
	"order_detail",
	{
		id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
		orderId: int("order_id", { mode: "number" })
			.references(() => OrdersTable.id, { onDelete: "cascade" })
			.notNull(),
		productId: int("product_id", { mode: "number" })
			.references(() => ProductsTable.id)
			.notNull(),
		quantity: int("quantity", { mode: "number" }).notNull(),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
		
	},
	(table) => [
		index("detail_order_idx").on(table.orderId),
		index("detail_product_idx").on(table.productId),
		index("detail_deleted_at_idx").on(table.deletedAt),
	],
);

export const PaymentsTable = createTable(
	"payment",
	{
		id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
		orderId: int("order_id", { mode: "number" })
			.references(() => OrdersTable.id)
			.notNull(),
		provider: text("provider", { enum: paymentProvider }).notNull(),
		status: text("status", {
			enum: paymentStatus,
		}).notNull(),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("payment_order_idx").on(table.orderId),
		index("payment_status_idx").on(table.status),
		index("payment_created_at_idx").on(table.createdAt),
		index("payment_deleted_at_idx").on(table.deletedAt),
	],
);

export const CartsTable = createTable(
	"cart",
	{
		id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
		customerId: int("customer_id", { mode: "number" })
			.references(() => CustomersTable.phone)
			.notNull(),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("cart_customer_idx").on(table.customerId),
		index("cart_created_at_idx").on(table.createdAt),
		index("cart_deleted_at_idx").on(table.deletedAt),
	],
);

export const CartItemsTable = createTable(
	"cart_item",
	{
		id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
		cartId: int("cart_id", { mode: "number" })
			.references(() => CartsTable.id, { onDelete: "cascade" })
			.notNull(),
		productId: int("product_variant_id", { mode: "number" })
			.references(() => ProductsTable.id)
			.notNull(),
		quantity: int("quantity", { mode: "number" }).notNull(),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("cart_item_cart_idx").on(table.cartId),
		index("cart_item_product_idx").on(table.productId),
		index("cart_item_deleted_at_idx").on(table.deletedAt),
	],
);

export const SalesTable = createTable(
	"sales",
	{
		id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
		productId: int("product_id", { mode: "number" })
			.references(() => ProductsTable.id)
			.notNull(),
		orderId: int("order_id", { mode: "number" })
			.references(() => OrdersTable.id)
			.notNull(),
		quantitySold: int("quantity_sold", { mode: "number" }).notNull(),
		productCost: int("product_cost", { mode: "number" }).notNull(),
		sellingPrice: int("selling_price", { mode: "number" }).notNull(),
		discountApplied: int("discount_applied", { mode: "number" }).default(0),
		createdAt: int("created_at", { mode: "timestamp" }).default(
			sql`(unixepoch())`,
		),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("sales_product_idx").on(table.productId),
		index("sales_created_at_idx").on(table.createdAt),
		index("sales_product_created_idx").on(table.productId, table.createdAt),
		index("sales_deleted_at_idx").on(table.deletedAt),
	],
);

export const PurchasesTable = createTable(
	"purchase",
	{
		id: int("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
		productId: int("product_id", { mode: "number" })
			.references(() => ProductsTable.id)
			.notNull(),
		quantityPurchased: int("quantity_purchased", { mode: "number" }).notNull(),
		unitCost: int("unit_cost", { mode: "number" }).notNull(),
		createdAt: int("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: int("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: int("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("purchase_id_idx").on(table.id),
		index("purchase_product_idx").on(table.productId),
		index("purchase_created_idx").on(table.createdAt),
		index("purchase_product_created_idx").on(table.productId, table.createdAt),
		index("purchase_deleted_at_idx").on(table.deletedAt),
	],
);

export const ordersRelations = relations(OrdersTable, ({ many }) => ({
	orderDetails: many(OrderDetailsTable),
	payments: many(PaymentsTable),
}));

export const paymentsRelations = relations(PaymentsTable, ({ one }) => ({
	order: one(OrdersTable, {
		fields: [PaymentsTable.orderId],
		references: [OrdersTable.id],
	}),
}));

export const orderDetailsRelations = relations(
	OrderDetailsTable,
	({ one }) => ({
		order: one(OrdersTable, {
			fields: [OrderDetailsTable.orderId],
			references: [OrdersTable.id],
		}),
		product: one(ProductsTable, {
			fields: [OrderDetailsTable.productId],
			references: [ProductsTable.id],
		}),
	}),
);

export const productsRelations = relations(ProductsTable, ({ many, one }) => ({
	images: many(ProductImagesTable),
	category: one(CategoriesTable, {
		fields: [ProductsTable.categoryId],
		references: [CategoriesTable.id],
	}),
	brand: one(BrandsTable, {
		fields: [ProductsTable.brandId],
		references: [BrandsTable.id],
	}),
}));

export const productImagesRelations = relations(
	ProductImagesTable,
	({ one }) => ({
		product: one(ProductsTable, {
			fields: [ProductImagesTable.productId],
			references: [ProductsTable.id],
		}),
	}),
);
export const purchaseRelations = relations(PurchasesTable, ({ one }) => ({
	product: one(ProductsTable, {
		fields: [PurchasesTable.productId],
		references: [ProductsTable.id],
	}),
}));

export type UserSelectType = InferSelectModel<typeof UsersTable>;
export type CustomerSelectType = InferSelectModel<typeof CustomersTable>;
export type BrandSelectType = InferSelectModel<typeof BrandsTable>;
export type CategorySelectType = InferSelectModel<typeof CategoriesTable>;
export type ProductSelectType = InferSelectModel<typeof ProductsTable>;

export type ProductImageSelectType = InferSelectModel<
	typeof ProductImagesTable
>;
export type OrderSelectType = InferSelectModel<typeof OrdersTable>;
export type OrderDetailSelectType = InferSelectModel<typeof OrderDetailsTable>;
export type PaymentSelectType = InferSelectModel<typeof PaymentsTable>;
export type CartSelectType = InferSelectModel<typeof CartsTable>;
export type CartItemSelectType = InferSelectModel<typeof CartItemsTable>;

export type PurchaseSelectType = InferSelectModel<typeof PurchasesTable>;
export type SalesSelectType = InferSelectModel<typeof SalesTable>;

export type UserInsertType = InferInsertModel<typeof UsersTable>;
export type CustomerInsertType = InferInsertModel<typeof CustomersTable>;
export type BrandInsertType = InferInsertModel<typeof BrandsTable>;
export type CategoryInsertType = InferInsertModel<typeof CategoriesTable>;
export type ProductInsertType = InferInsertModel<typeof ProductsTable>;
export type ProductImageInsertType = InferInsertModel<
	typeof ProductImagesTable
>;
export type OrderInsertType = InferInsertModel<typeof OrdersTable>;
export type OrderDetailInsertType = InferInsertModel<typeof OrderDetailsTable>;
export type PaymentInsertType = InferInsertModel<typeof PaymentsTable>;
export type CartInsertType = InferInsertModel<typeof CartsTable>;
export type CartItemInsertType = InferInsertModel<typeof CartItemsTable>;

export type PurchaseInsertType = InferInsertModel<typeof PurchasesTable>;
export type SalesInsertType = InferInsertModel<typeof SalesTable>;
