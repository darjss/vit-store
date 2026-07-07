import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	sqliteTableCreator,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";
import {
	deliveryProvider,
	orderStatus,
	paymentProvider,
	paymentStatus,
	purchaseProvider,
	status,
} from "~/lib/constants";

export const createTable = sqliteTableCreator((name) => `ecom_vit_${name}`);

export const UsersTable = createTable(
	"user",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		username: text("username").notNull(),
		googleId: text("google_id").unique(),
		isApproved: integer("is_approved", { mode: "boolean" })
			.default(false)
			.notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
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
		id: integer("id").primaryKey({ autoIncrement: true }),
		phone: integer("phone").notNull().unique(),
		address: text("address"),
		addressZoneId: integer("address_zone_id"),
		facebook_username: text("facebook_username"),
		instagram_username: text("instagram_username"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("phone_idx").on(table.phone),
		index("customer_created_at_idx").on(table.createdAt),
		index("customer_admin_list_idx").on(table.deletedAt, table.createdAt),
	],
);

export const BrandsTable = createTable(
	"brand",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull().unique(),
		slug: text("slug").notNull().unique(),
		logoUrl: text("logo_url").notNull(),
		description: text("description"),
		bannerImage: text("banner_image"),
		seoTitle: text("seo_title"),
		seoDescription: text("seo_description"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("brand_name_idx").on(table.name),
		index("brand_slug_idx").on(table.slug),
		index("brand_created_at_idx").on(table.createdAt),
		index("brand_deleted_at_idx").on(table.deletedAt),
	],
);

export const CategoriesTable = createTable(
	"category",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull().unique(),
		slug: text("slug").notNull().unique(),
		description: text("description"),
		bannerImage: text("banner_image"),
		seoTitle: text("seo_title"),
		seoDescription: text("seo_description"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("category_name_idx").on(table.name),
		index("category_slug_idx").on(table.slug),
		index("category_created_at_idx").on(table.createdAt),
		index("category_deleted_at_idx").on(table.deletedAt),
	],
);

export const ProductsTable = createTable(
	"product",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		name: text("name").notNull(),
		slug: text("slug").notNull(),
		description: text("description").notNull(),
		status: text("status", { enum: status }).default("draft").notNull(),
		discount: integer("discount").default(0).notNull(),
		amount: text("amount").notNull(),
		potency: text("potency").notNull(),
		stock: integer("stock").default(0).notNull(),
		price: integer("price").notNull(),
		dailyIntake: integer("daily_intake").default(0).notNull(),
		categoryId: integer("category_id")
			.references(() => CategoriesTable.id)
			.notNull(),
		brandId: integer("brand_id")
			.references(() => BrandsTable.id)
			.notNull(),
		tags: text("tags", { mode: "json" })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		isFeatured: integer("is_featured", { mode: "boolean" })
			.default(false)
			.notNull(),
		ingredients: text("ingredients", { mode: "json" })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		seoTitle: text("seo_title"),
		seoDescription: text("seo_description"),
		name_mn: text("name_mn"),
		weightGrams: integer("weight_grams").default(0).notNull(),
		expirationDate: text("expiration_date"),
		// Slugs previously used by this product. When a product name is
		// cleaned (e.g. dedup of a duplicated brand prefix) and the slug is
		// regenerated, the prior slug is appended here so the storefront can
		// 301-redirect old URLs to the canonical one. See issue #78.
		oldSlugs: text("old_slugs", { mode: "json" })
			.$type<string[]>()
			.notNull()
			.default(sql`'[]'`),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("product_id_idx").on(table.id),
		index("product_name_idx").on(table.name),
		index("product_category_idx").on(table.categoryId),
		index("product_brand_idx").on(table.brandId),
		index("product_stock_idx").on(table.stock),
		index("product_price_idx").on(table.price),
		index("product_admin_list_idx").on(
			table.deletedAt,
			table.brandId,
			table.status,
			table.createdAt,
		),
		index("product_store_list_created_idx").on(
			table.deletedAt,
			table.status,
			table.createdAt,
			table.id,
		),
		index("product_store_list_price_idx").on(
			table.deletedAt,
			table.status,
			table.price,
			table.id,
		),
		index("product_store_list_stock_idx").on(
			table.deletedAt,
			table.status,
			table.stock,
			table.id,
		),
		index("product_featured_store_idx").on(
			table.isFeatured,
			table.status,
			table.deletedAt,
			table.updatedAt,
		),
		index("product_category_store_idx").on(
			table.categoryId,
			table.deletedAt,
			table.status,
			table.updatedAt,
		),
		index("product_brand_store_idx").on(
			table.brandId,
			table.deletedAt,
			table.status,
			table.updatedAt,
		),
	],
);

export const ProductImagesTable = createTable(
	"product_image",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		productId: integer("product_id")
			.references(() => ProductsTable.id, { onDelete: "cascade" })
			.notNull(),
		url: text("url").notNull(),
		isPrimary: integer("is_primary", { mode: "boolean" })
			.default(false)
			.notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("image_product_idx").on(table.productId),
		index("image_product_primary_idx").on(table.productId, table.isPrimary),
		index("image_product_deleted_primary_idx").on(
			table.productId,
			table.deletedAt,
			table.isPrimary,
		),
	],
);

export const OrdersTable = createTable(
	"order",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		orderNumber: text("order_number").notNull(),
		customerPhone: integer("customer_phone")
			.references(() => CustomersTable.phone)
			.notNull(),
		status: text("status", {
			enum: orderStatus,
		}).notNull(),
		address: text("address").notNull(),
		addressZoneId: integer("address_zone_id"),
		deliveryProvider: text("delivery_provider", {
			enum: deliveryProvider,
		}).notNull(),
		total: integer("total").notNull(),
		notes: text("notes"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("order_id_idx").on(table.id),
		index("order_customer_idx").on(table.customerPhone),
		uniqueIndex("order_number_unique_idx").on(table.orderNumber),
		index("order_status_idx").on(table.status),
		index("order_admin_list_idx").on(
			table.deletedAt,
			table.status,
			table.createdAt,
		),
		index("order_date_range_idx").on(table.deletedAt, table.createdAt),
		index("order_customer_deleted_idx").on(
			table.customerPhone,
			table.deletedAt,
		),
	],
);

export const OrderDetailsTable = createTable(
	"order_detail",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		orderId: integer("order_id")
			.references(() => OrdersTable.id, { onDelete: "cascade" })
			.notNull(),
		productId: integer("product_id")
			.references(() => ProductsTable.id)
			.notNull(),
		quantity: integer("quantity").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
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
		id: integer("id").primaryKey({ autoIncrement: true }),
		paymentNumber: text("payment_number").default("").notNull(),
		orderId: integer("order_id")
			.references(() => OrdersTable.id)
			.notNull(),
		provider: text("provider", { enum: paymentProvider }).notNull(),
		status: text("status", {
			enum: paymentStatus,
		}).notNull(),
		invoiceId: text("invoice_id"),
		amount: integer("amount").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("payment_order_idx").on(table.orderId),
		uniqueIndex("payment_number_unique_idx").on(table.paymentNumber),
		index("payment_created_at_idx").on(table.createdAt),
		index("payment_status_created_idx").on(table.status, table.createdAt),
		index("payment_number_status_idx").on(table.paymentNumber, table.status),
	],
);

export const MessengerNotificationFailuresTable = createTable(
	"messenger_notification_failure",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		paymentNumber: text("payment_number").notNull(),
		purpose: text("purpose").notNull(),
		status: text("status", { enum: ["pending", "sent", "failed"] })
			.notNull()
			.default("pending"),
		payload: text("payload", { mode: "json" }).notNull(),
		errorMessage: text("error_message"),
		errorCode: text("error_code"),
		retryCount: integer("retry_count").notNull().default(0),
		lastAttemptAt: integer("last_attempt_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
	},
	(table) => [
		uniqueIndex("messenger_notification_payment_purpose_unique_idx").on(
			table.paymentNumber,
			table.purpose,
		),
		index("messenger_notification_status_created_idx").on(
			table.status,
			table.createdAt,
		),
	],
);

export const RestockSubscriptionsTable = createTable(
	"restock_subscription",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		productId: integer("product_id")
			.references(() => ProductsTable.id, { onDelete: "cascade" })
			.notNull(),
		channel: text("channel", { enum: ["sms", "email"] }).notNull(),
		contact: text("contact").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp" })
			.default(sql`(unixepoch() + 2592000)`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("restock_subscription_unique_idx").on(
			table.productId,
			table.channel,
			table.contact,
		),
		index("restock_subscription_product_idx").on(table.productId),
		index("restock_subscription_expires_idx").on(table.expiresAt),
	],
);

export const CartsTable = createTable(
	"cart",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		customerId: integer("customer_id")
			.references(() => CustomersTable.phone)
			.notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
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
		id: integer("id").primaryKey({ autoIncrement: true }),
		cartId: integer("cart_id")
			.references(() => CartsTable.id, { onDelete: "cascade" })
			.notNull(),
		productId: integer("product_variant_id")
			.references(() => ProductsTable.id)
			.notNull(),
		quantity: integer("quantity").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
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
		id: integer("id").primaryKey({ autoIncrement: true }),
		productId: integer("product_id")
			.references(() => ProductsTable.id)
			.notNull(),
		orderId: integer("order_id")
			.references(() => OrdersTable.id)
			.notNull(),
		quantitySold: integer("quantity_sold").notNull(),
		productCost: integer("product_cost").notNull(),
		sellingPrice: integer("selling_price").notNull(),
		discountApplied: integer("discount_applied").default(0),
		createdAt: integer("created_at", { mode: "timestamp" }).default(
			sql`(unixepoch())`,
		),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("sales_product_idx").on(table.productId),
		index("sales_created_at_idx").on(table.createdAt),
		index("sales_product_created_idx").on(table.productId, table.createdAt),
		index("sales_date_range_idx").on(table.createdAt, table.deletedAt),
	],
);

export const PurchasesTable = createTable(
	"purchase",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		provider: text("provider", { enum: purchaseProvider })
			.default("unknown")
			.notNull(),
		externalOrderNumber: text("external_order_number").notNull(),
		trackingNumber: text("tracking_number"),
		shippingCost: integer("shipping_cost").default(0).notNull(),
		notes: text("notes"),
		orderedAt: integer("ordered_at", { mode: "timestamp" }),
		shippedAt: integer("shipped_at", { mode: "timestamp" }),
		forwarderReceivedAt: integer("forwarder_received_at", {
			mode: "timestamp",
		}),
		receivedAt: integer("received_at", { mode: "timestamp" }),
		cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("purchase_id_idx").on(table.id),
		index("purchase_provider_idx").on(table.provider),
		index("purchase_external_order_idx").on(table.externalOrderNumber),
		index("purchase_tracking_number_idx").on(table.trackingNumber),
		index("purchase_created_idx").on(table.createdAt),
		index("purchase_ordered_at_idx").on(table.orderedAt),
		index("purchase_received_at_idx").on(table.receivedAt),
		index("purchase_active_idx").on(table.deletedAt, table.cancelledAt),
	],
);

export const PurchaseItemsTable = createTable(
	"purchase_item",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		purchaseId: integer("purchase_id")
			.references(() => PurchasesTable.id, { onDelete: "cascade" })
			.notNull(),
		productId: integer("product_id")
			.references(() => ProductsTable.id)
			.notNull(),
		quantityOrdered: integer("quantity_ordered").notNull(),
		unitCost: integer("unit_cost").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("purchase_item_purchase_idx").on(table.purchaseId),
		index("purchase_item_product_idx").on(table.productId),
		index("purchase_item_purchase_deleted_idx").on(
			table.purchaseId,
			table.deletedAt,
		),
		index("purchase_item_product_deleted_idx").on(
			table.productId,
			table.deletedAt,
		),
	],
);

export const PurchaseReceiptsTable = createTable(
	"purchase_receipt",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		purchaseId: integer("purchase_id")
			.references(() => PurchasesTable.id, { onDelete: "cascade" })
			.notNull(),
		receivedAt: integer("received_at", { mode: "timestamp" }).notNull(),
		notes: text("notes"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("purchase_receipt_purchase_idx").on(table.purchaseId),
		index("purchase_receipt_received_at_idx").on(table.receivedAt),
		index("purchase_receipt_deleted_at_idx").on(table.deletedAt),
	],
);

export const PurchaseReceiptItemsTable = createTable(
	"purchase_receipt_item",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		receiptId: integer("receipt_id")
			.references(() => PurchaseReceiptsTable.id, { onDelete: "cascade" })
			.notNull(),
		purchaseItemId: integer("purchase_item_id")
			.references(() => PurchaseItemsTable.id, { onDelete: "cascade" })
			.notNull(),
		quantityReceived: integer("quantity_received").notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" }).$onUpdate(
			() => new Date(),
		),
		deletedAt: integer("deleted_at", { mode: "timestamp" }),
	},
	(table) => [
		index("purchase_receipt_item_receipt_idx").on(table.receiptId),
		index("purchase_receipt_item_purchase_item_idx").on(table.purchaseItemId),
		index("purchase_receipt_item_deleted_at_idx").on(table.deletedAt),
	],
);

export const ordersRelations = relations(OrdersTable, ({ many }) => ({
	orderDetails: many(OrderDetailsTable),
	payments: many(PaymentsTable),
	sales: many(SalesTable),
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
export const purchaseRelations = relations(PurchasesTable, ({ many }) => ({
	items: many(PurchaseItemsTable),
	receipts: many(PurchaseReceiptsTable),
}));

export const purchaseItemsRelations = relations(
	PurchaseItemsTable,
	({ one, many }) => ({
		purchase: one(PurchasesTable, {
			fields: [PurchaseItemsTable.purchaseId],
			references: [PurchasesTable.id],
		}),
		product: one(ProductsTable, {
			fields: [PurchaseItemsTable.productId],
			references: [ProductsTable.id],
		}),
		receiptItems: many(PurchaseReceiptItemsTable),
	}),
);

export const purchaseReceiptsRelations = relations(
	PurchaseReceiptsTable,
	({ one, many }) => ({
		purchase: one(PurchasesTable, {
			fields: [PurchaseReceiptsTable.purchaseId],
			references: [PurchasesTable.id],
		}),
		items: many(PurchaseReceiptItemsTable),
	}),
);

export const purchaseReceiptItemsRelations = relations(
	PurchaseReceiptItemsTable,
	({ one }) => ({
		receipt: one(PurchaseReceiptsTable, {
			fields: [PurchaseReceiptItemsTable.receiptId],
			references: [PurchaseReceiptsTable.id],
		}),
		purchaseItem: one(PurchaseItemsTable, {
			fields: [PurchaseReceiptItemsTable.purchaseItemId],
			references: [PurchaseItemsTable.id],
		}),
	}),
);

export const salesRelations = relations(SalesTable, ({ one }) => ({
	order: one(OrdersTable, {
		fields: [SalesTable.orderId],
		references: [OrdersTable.id],
	}),
	product: one(ProductsTable, {
		fields: [SalesTable.productId],
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
export type RestockSubscriptionSelectType = InferSelectModel<
	typeof RestockSubscriptionsTable
>;

export type PurchaseSelectType = InferSelectModel<typeof PurchasesTable>;
export type PurchaseItemSelectType = InferSelectModel<
	typeof PurchaseItemsTable
>;
export type PurchaseReceiptSelectType = InferSelectModel<
	typeof PurchaseReceiptsTable
>;
export type PurchaseReceiptItemSelectType = InferSelectModel<
	typeof PurchaseReceiptItemsTable
>;
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
export type RestockSubscriptionInsertType = InferInsertModel<
	typeof RestockSubscriptionsTable
>;

export type PurchaseInsertType = InferInsertModel<typeof PurchasesTable>;
export type PurchaseItemInsertType = InferInsertModel<
	typeof PurchaseItemsTable
>;
export type PurchaseReceiptInsertType = InferInsertModel<
	typeof PurchaseReceiptsTable
>;
export type PurchaseReceiptItemInsertType = InferInsertModel<
	typeof PurchaseReceiptItemsTable
>;
export type SalesInsertType = InferInsertModel<typeof SalesTable>;
