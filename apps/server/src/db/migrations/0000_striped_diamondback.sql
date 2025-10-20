CREATE TABLE `ecom_vit_brand` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(256) NOT NULL,
	`logo_url` text(512) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecom_vit_brand_name_unique` ON `ecom_vit_brand` (`name`);--> statement-breakpoint
CREATE INDEX `brand_name_idx` ON `ecom_vit_brand` (`name`);--> statement-breakpoint
CREATE INDEX `brand_created_at_idx` ON `ecom_vit_brand` (`created_at`);--> statement-breakpoint
CREATE INDEX `brand_deleted_at_idx` ON `ecom_vit_brand` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_cart_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cart_id` integer NOT NULL,
	`product_variant_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`cart_id`) REFERENCES `ecom_vit_cart`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_variant_id`) REFERENCES `ecom_vit_product`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cart_item_cart_idx` ON `ecom_vit_cart_item` (`cart_id`);--> statement-breakpoint
CREATE INDEX `cart_item_product_idx` ON `ecom_vit_cart_item` (`product_variant_id`);--> statement-breakpoint
CREATE INDEX `cart_item_deleted_at_idx` ON `ecom_vit_cart_item` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_cart` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`customer_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`customer_id`) REFERENCES `ecom_vit_customer`(`phone`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cart_customer_idx` ON `ecom_vit_cart` (`customer_id`);--> statement-breakpoint
CREATE INDEX `cart_created_at_idx` ON `ecom_vit_cart` (`created_at`);--> statement-breakpoint
CREATE INDEX `cart_deleted_at_idx` ON `ecom_vit_cart` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_category` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(256) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecom_vit_category_name_unique` ON `ecom_vit_category` (`name`);--> statement-breakpoint
CREATE INDEX `category_name_idx` ON `ecom_vit_category` (`name`);--> statement-breakpoint
CREATE INDEX `category_created_at_idx` ON `ecom_vit_category` (`created_at`);--> statement-breakpoint
CREATE INDEX `category_deleted_at_idx` ON `ecom_vit_category` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_customer` (
	`phone` integer PRIMARY KEY NOT NULL,
	`address` text(256),
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecom_vit_customer_phone_unique` ON `ecom_vit_customer` (`phone`);--> statement-breakpoint
CREATE INDEX `phone_idx` ON `ecom_vit_customer` (`phone`);--> statement-breakpoint
CREATE INDEX `customer_created_at_idx` ON `ecom_vit_customer` (`created_at`);--> statement-breakpoint
CREATE INDEX `customer_deleted_at_idx` ON `ecom_vit_customer` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_order_detail` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `ecom_vit_order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `ecom_vit_product`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `detail_order_idx` ON `ecom_vit_order_detail` (`order_id`);--> statement-breakpoint
CREATE INDEX `detail_product_idx` ON `ecom_vit_order_detail` (`product_id`);--> statement-breakpoint
CREATE INDEX `detail_deleted_at_idx` ON `ecom_vit_order_detail` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_order` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_number` text(8) NOT NULL,
	`customer_phone` integer NOT NULL,
	`status` text NOT NULL,
	`address` text(256) NOT NULL,
	`delivery_provider` text NOT NULL,
	`total` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`customer_phone`) REFERENCES `ecom_vit_customer`(`phone`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_id_idx` ON `ecom_vit_order` (`id`);--> statement-breakpoint
CREATE INDEX `order_customer_idx` ON `ecom_vit_order` (`customer_phone`);--> statement-breakpoint
CREATE INDEX `order_number_idx` ON `ecom_vit_order` (`order_number`);--> statement-breakpoint
CREATE INDEX `order_status_idx` ON `ecom_vit_order` (`status`);--> statement-breakpoint
CREATE INDEX `order_created_at_idx` ON `ecom_vit_order` (`created_at`);--> statement-breakpoint
CREATE INDEX `order_deleted_at_idx` ON `ecom_vit_order` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_payment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`order_id` integer NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `ecom_vit_order`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_order_idx` ON `ecom_vit_payment` (`order_id`);--> statement-breakpoint
CREATE INDEX `payment_status_idx` ON `ecom_vit_payment` (`status`);--> statement-breakpoint
CREATE INDEX `payment_created_at_idx` ON `ecom_vit_payment` (`created_at`);--> statement-breakpoint
CREATE INDEX `payment_deleted_at_idx` ON `ecom_vit_payment` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_product_image` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`url` text(512) NOT NULL,
	`is_primary` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `ecom_vit_product`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `image_product_idx` ON `ecom_vit_product_image` (`product_id`);--> statement-breakpoint
CREATE INDEX `image_product_primary_idx` ON `ecom_vit_product_image` (`product_id`,`is_primary`);--> statement-breakpoint
CREATE INDEX `image_deleted_at_idx` ON `ecom_vit_product_image` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_product` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(256) NOT NULL,
	`slug` text(256) NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`amount` text(15) NOT NULL,
	`potency` text(10) NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`price` integer NOT NULL,
	`daily_intake` integer DEFAULT 0 NOT NULL,
	`category_id` integer NOT NULL,
	`brand_id` integer NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`is_featured` integer DEFAULT 0 NOT NULL,
	`ingredients` text,
	`seo_title` text(256),
	`seo_description` text(512),
	`min_stock` integer DEFAULT 0 NOT NULL,
	`weight_grams` integer DEFAULT 0 NOT NULL,
	`origin_country` text(3),
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`category_id`) REFERENCES `ecom_vit_category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `ecom_vit_brand`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_id_idx` ON `ecom_vit_product` (`id`);--> statement-breakpoint
CREATE INDEX `product_name_idx` ON `ecom_vit_product` (`name`);--> statement-breakpoint
CREATE INDEX `product_status_idx` ON `ecom_vit_product` (`status`);--> statement-breakpoint
CREATE INDEX `product_category_idx` ON `ecom_vit_product` (`category_id`);--> statement-breakpoint
CREATE INDEX `product_brand_idx` ON `ecom_vit_product` (`brand_id`);--> statement-breakpoint
CREATE INDEX `product_stock_idx` ON `ecom_vit_product` (`stock`);--> statement-breakpoint
CREATE INDEX `product_price_idx` ON `ecom_vit_product` (`price`);--> statement-breakpoint
CREATE INDEX `product_created_at_idx` ON `ecom_vit_product` (`created_at`);--> statement-breakpoint
CREATE INDEX `product_deleted_at_idx` ON `ecom_vit_product` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `product_is_featured_idx` ON `ecom_vit_product` (`is_featured`);--> statement-breakpoint
CREATE TABLE `ecom_vit_purchase` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`quantity_purchased` integer NOT NULL,
	`unit_cost` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `ecom_vit_product`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_id_idx` ON `ecom_vit_purchase` (`id`);--> statement-breakpoint
CREATE INDEX `purchase_product_idx` ON `ecom_vit_purchase` (`product_id`);--> statement-breakpoint
CREATE INDEX `purchase_created_idx` ON `ecom_vit_purchase` (`created_at`);--> statement-breakpoint
CREATE INDEX `purchase_product_created_idx` ON `ecom_vit_purchase` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `purchase_deleted_at_idx` ON `ecom_vit_purchase` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`order_id` integer NOT NULL,
	`quantity_sold` integer NOT NULL,
	`product_cost` integer NOT NULL,
	`selling_price` integer NOT NULL,
	`discount_applied` integer DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch()),
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `ecom_vit_product`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `ecom_vit_order`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_product_idx` ON `ecom_vit_sales` (`product_id`);--> statement-breakpoint
CREATE INDEX `sales_created_at_idx` ON `ecom_vit_sales` (`created_at`);--> statement-breakpoint
CREATE INDEX `sales_product_created_idx` ON `ecom_vit_sales` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sales_deleted_at_idx` ON `ecom_vit_sales` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text(256) NOT NULL,
	`google_id` text(256),
	`is_approved` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecom_vit_user_google_id_unique` ON `ecom_vit_user` (`google_id`);--> statement-breakpoint
CREATE INDEX `username_idx` ON `ecom_vit_user` (`username`);--> statement-breakpoint
CREATE INDEX `google_id_idx` ON `ecom_vit_user` (`google_id`);--> statement-breakpoint
CREATE INDEX `user_created_at_idx` ON `ecom_vit_user` (`created_at`);--> statement-breakpoint
CREATE INDEX `user_deleted_at_idx` ON `ecom_vit_user` (`deleted_at`);