import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTableCreator,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import {
  deliveryProvider,
  orderStatus,
  paymentProvider,
  paymentStatus,
  status,
} from "../lib/constants";

export const createTable = pgTableCreator((name) => `ecom_vit_${name}`);

export const UsersTable = createTable(
  "user",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    username: varchar("username", { length: 256 }).notNull(),
    googleId: varchar("google_id", { length: 256 }).unique(),
    isApproved: boolean("is_approved").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    phone: integer("phone").notNull().unique(),
    address: varchar("address", { length: 256 }),
    facebook_username: varchar("facebook_username", { length: 256 }),
    instagram_username: varchar("instagram_username", { length: 256 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 256 }).notNull().unique(),
    logoUrl: varchar("logo_url", { length: 512 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: varchar("name", { length: 256 }).notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity().notNull(),
    name: varchar("name", { length: 256 }).notNull(),
    slug: varchar("slug", { length: 256 }).notNull(),
    description: text("description").notNull(),
    status: text("status", { enum: status }).default("draft").notNull(),
    discount: integer("discount").default(0).notNull(),
    amount: varchar("amount", { length: 256 }).notNull(),
    potency: varchar("potency", { length: 256 }).notNull(),
    stock: integer("stock").default(0).notNull(),
    price: integer("price").notNull(),
    dailyIntake: integer("daily_intake").default(0).notNull(),
    categoryId: integer("category_id")
      .references(() => CategoriesTable.id)
      .notNull(),
    brandId: integer("brand_id")
      .references(() => BrandsTable.id)
      .notNull(),
    tags: text("tags")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isFeatured: boolean("is_featured").default(false).notNull(),
    ingredients: jsonb("ingredients")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    seoTitle: varchar("seo_title", { length: 256 }),
    seoDescription: varchar("seo_description", { length: 512 }),
    name_mn: varchar("name_mn", { length: 256 }),
    weightGrams: integer("weight_grams").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity().notNull(),
    productId: integer("product_id")
      .references(() => ProductsTable.id, { onDelete: "cascade" })
      .notNull(),
    url: varchar("url", { length: 512 }).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    orderNumber: varchar("order_number", { length: 8 }).notNull(),
    customerPhone: integer("customer_phone")
      .references(() => CustomersTable.phone)
      .notNull(),
    status: text("status", {
      enum: orderStatus,
    }).notNull(),
    address: varchar("address", { length: 256 }).notNull(),
    deliveryProvider: text("delivery_provider", {
      enum: deliveryProvider,
    }).notNull(),
    total: integer("total").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    orderId: integer("order_id")
      .references(() => OrdersTable.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id")
      .references(() => ProductsTable.id)
      .notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    paymentNumber: varchar("payment_number", { length: 10 })
      .default("")
      .notNull(),
    orderId: integer("order_id")
      .references(() => OrdersTable.id)
      .notNull(),
    provider: text("provider", { enum: paymentProvider }).notNull(),
    status: text("status", {
      enum: paymentStatus,
    }).notNull(),
    invoiceId: varchar("invoice_id", { length: 64 }),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("payment_order_idx").on(table.orderId),
    index("payment_number_idx").on(table.paymentNumber),
    index("payment_status_idx").on(table.status),
    index("payment_created_at_idx").on(table.createdAt),
    index("payment_deleted_at_idx").on(table.deletedAt),
  ],
);

export const CartsTable = createTable(
  "cart",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    customerId: integer("customer_id")
      .references(() => CustomersTable.phone)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    cartId: integer("cart_id")
      .references(() => CartsTable.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_variant_id")
      .references(() => ProductsTable.id)
      .notNull(),
    quantity: integer("quantity").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
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
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
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
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    productId: integer("product_id")
      .references(() => ProductsTable.id)
      .notNull(),
    quantityPurchased: integer("quantity_purchased").notNull(),
    unitCost: integer("unit_cost").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
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
export const purchaseRelations = relations(PurchasesTable, ({ one }) => ({
  product: one(ProductsTable, {
    fields: [PurchasesTable.productId],
    references: [ProductsTable.id],
  }),
}));

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
