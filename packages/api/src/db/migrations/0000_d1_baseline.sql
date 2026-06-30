CREATE TABLE `ecom_vit_brand` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo_url` text NOT NULL,
	`description` text,
	`banner_image` text,
	`seo_title` text,
	`seo_description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecom_vit_brand_name_unique` ON `ecom_vit_brand` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `ecom_vit_brand_slug_unique` ON `ecom_vit_brand` (`slug`);--> statement-breakpoint
CREATE INDEX `brand_name_idx` ON `ecom_vit_brand` (`name`);--> statement-breakpoint
CREATE INDEX `brand_slug_idx` ON `ecom_vit_brand` (`slug`);--> statement-breakpoint
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
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`banner_image` text,
	`seo_title` text,
	`seo_description` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecom_vit_category_name_unique` ON `ecom_vit_category` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `ecom_vit_category_slug_unique` ON `ecom_vit_category` (`slug`);--> statement-breakpoint
CREATE INDEX `category_name_idx` ON `ecom_vit_category` (`name`);--> statement-breakpoint
CREATE INDEX `category_slug_idx` ON `ecom_vit_category` (`slug`);--> statement-breakpoint
CREATE INDEX `category_created_at_idx` ON `ecom_vit_category` (`created_at`);--> statement-breakpoint
CREATE INDEX `category_deleted_at_idx` ON `ecom_vit_category` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_customer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phone` integer NOT NULL,
	`address` text,
	`address_zone_id` integer,
	`facebook_username` text,
	`instagram_username` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ecom_vit_customer_phone_unique` ON `ecom_vit_customer` (`phone`);--> statement-breakpoint
CREATE INDEX `phone_idx` ON `ecom_vit_customer` (`phone`);--> statement-breakpoint
CREATE INDEX `customer_created_at_idx` ON `ecom_vit_customer` (`created_at`);--> statement-breakpoint
CREATE INDEX `customer_admin_list_idx` ON `ecom_vit_customer` (`deleted_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_messenger_notification_failure` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_number` text NOT NULL,
	`purpose` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text NOT NULL,
	`error_message` text,
	`error_code` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messenger_notification_payment_purpose_unique_idx` ON `ecom_vit_messenger_notification_failure` (`payment_number`,`purpose`);--> statement-breakpoint
CREATE INDEX `messenger_notification_status_created_idx` ON `ecom_vit_messenger_notification_failure` (`status`,`created_at`);--> statement-breakpoint
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
	`order_number` text NOT NULL,
	`customer_phone` integer NOT NULL,
	`status` text NOT NULL,
	`address` text NOT NULL,
	`address_zone_id` integer,
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
CREATE UNIQUE INDEX `order_number_unique_idx` ON `ecom_vit_order` (`order_number`);--> statement-breakpoint
CREATE INDEX `order_status_idx` ON `ecom_vit_order` (`status`);--> statement-breakpoint
CREATE INDEX `order_admin_list_idx` ON `ecom_vit_order` (`deleted_at`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_date_range_idx` ON `ecom_vit_order` (`deleted_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `order_customer_deleted_idx` ON `ecom_vit_order` (`customer_phone`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_payment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_number` text DEFAULT '' NOT NULL,
	`order_id` integer NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`invoice_id` text,
	`amount` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `ecom_vit_order`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payment_order_idx` ON `ecom_vit_payment` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_number_unique_idx` ON `ecom_vit_payment` (`payment_number`);--> statement-breakpoint
CREATE INDEX `payment_created_at_idx` ON `ecom_vit_payment` (`created_at`);--> statement-breakpoint
CREATE INDEX `payment_status_created_idx` ON `ecom_vit_payment` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `payment_number_status_idx` ON `ecom_vit_payment` (`payment_number`,`status`);--> statement-breakpoint
CREATE TABLE `ecom_vit_product_image` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`url` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `ecom_vit_product`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `image_product_idx` ON `ecom_vit_product_image` (`product_id`);--> statement-breakpoint
CREATE INDEX `image_product_primary_idx` ON `ecom_vit_product_image` (`product_id`,`is_primary`);--> statement-breakpoint
CREATE INDEX `image_product_deleted_primary_idx` ON `ecom_vit_product_image` (`product_id`,`deleted_at`,`is_primary`);--> statement-breakpoint
CREATE TABLE `ecom_vit_product` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`amount` text NOT NULL,
	`potency` text NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`price` integer NOT NULL,
	`daily_intake` integer DEFAULT 0 NOT NULL,
	`category_id` integer NOT NULL,
	`brand_id` integer NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`ingredients` text DEFAULT '[]' NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`name_mn` text,
	`weight_grams` integer DEFAULT 0 NOT NULL,
	`expiration_date` text,
	`old_slugs` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`category_id`) REFERENCES `ecom_vit_category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`brand_id`) REFERENCES `ecom_vit_brand`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_id_idx` ON `ecom_vit_product` (`id`);--> statement-breakpoint
CREATE INDEX `product_name_idx` ON `ecom_vit_product` (`name`);--> statement-breakpoint
CREATE INDEX `product_category_idx` ON `ecom_vit_product` (`category_id`);--> statement-breakpoint
CREATE INDEX `product_brand_idx` ON `ecom_vit_product` (`brand_id`);--> statement-breakpoint
CREATE INDEX `product_stock_idx` ON `ecom_vit_product` (`stock`);--> statement-breakpoint
CREATE INDEX `product_price_idx` ON `ecom_vit_product` (`price`);--> statement-breakpoint
CREATE INDEX `product_admin_list_idx` ON `ecom_vit_product` (`deleted_at`,`brand_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `product_store_list_created_idx` ON `ecom_vit_product` (`deleted_at`,`status`,`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `product_store_list_price_idx` ON `ecom_vit_product` (`deleted_at`,`status`,`price`,`id`);--> statement-breakpoint
CREATE INDEX `product_store_list_stock_idx` ON `ecom_vit_product` (`deleted_at`,`status`,`stock`,`id`);--> statement-breakpoint
CREATE INDEX `product_featured_store_idx` ON `ecom_vit_product` (`is_featured`,`status`,`deleted_at`,`updated_at`);--> statement-breakpoint
CREATE INDEX `product_category_store_idx` ON `ecom_vit_product` (`category_id`,`deleted_at`,`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `product_brand_store_idx` ON `ecom_vit_product` (`brand_id`,`deleted_at`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_purchase_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`product_id` integer NOT NULL,
	`quantity_ordered` integer NOT NULL,
	`unit_cost` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`purchase_id`) REFERENCES `ecom_vit_purchase`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `ecom_vit_product`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_item_purchase_idx` ON `ecom_vit_purchase_item` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `purchase_item_product_idx` ON `ecom_vit_purchase_item` (`product_id`);--> statement-breakpoint
CREATE INDEX `purchase_item_purchase_deleted_idx` ON `ecom_vit_purchase_item` (`purchase_id`,`deleted_at`);--> statement-breakpoint
CREATE INDEX `purchase_item_product_deleted_idx` ON `ecom_vit_purchase_item` (`product_id`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_purchase_receipt_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`receipt_id` integer NOT NULL,
	`purchase_item_id` integer NOT NULL,
	`quantity_received` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`receipt_id`) REFERENCES `ecom_vit_purchase_receipt`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`purchase_item_id`) REFERENCES `ecom_vit_purchase_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `purchase_receipt_item_receipt_idx` ON `ecom_vit_purchase_receipt_item` (`receipt_id`);--> statement-breakpoint
CREATE INDEX `purchase_receipt_item_purchase_item_idx` ON `ecom_vit_purchase_receipt_item` (`purchase_item_id`);--> statement-breakpoint
CREATE INDEX `purchase_receipt_item_deleted_at_idx` ON `ecom_vit_purchase_receipt_item` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_purchase_receipt` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`purchase_id` integer NOT NULL,
	`received_at` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`purchase_id`) REFERENCES `ecom_vit_purchase`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `purchase_receipt_purchase_idx` ON `ecom_vit_purchase_receipt` (`purchase_id`);--> statement-breakpoint
CREATE INDEX `purchase_receipt_received_at_idx` ON `ecom_vit_purchase_receipt` (`received_at`);--> statement-breakpoint
CREATE INDEX `purchase_receipt_deleted_at_idx` ON `ecom_vit_purchase_receipt` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_purchase` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text DEFAULT 'unknown' NOT NULL,
	`external_order_number` text NOT NULL,
	`tracking_number` text,
	`shipping_cost` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`ordered_at` integer,
	`shipped_at` integer,
	`forwarder_received_at` integer,
	`received_at` integer,
	`cancelled_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `purchase_id_idx` ON `ecom_vit_purchase` (`id`);--> statement-breakpoint
CREATE INDEX `purchase_provider_idx` ON `ecom_vit_purchase` (`provider`);--> statement-breakpoint
CREATE INDEX `purchase_external_order_idx` ON `ecom_vit_purchase` (`external_order_number`);--> statement-breakpoint
CREATE INDEX `purchase_tracking_number_idx` ON `ecom_vit_purchase` (`tracking_number`);--> statement-breakpoint
CREATE INDEX `purchase_created_idx` ON `ecom_vit_purchase` (`created_at`);--> statement-breakpoint
CREATE INDEX `purchase_ordered_at_idx` ON `ecom_vit_purchase` (`ordered_at`);--> statement-breakpoint
CREATE INDEX `purchase_received_at_idx` ON `ecom_vit_purchase` (`received_at`);--> statement-breakpoint
CREATE INDEX `purchase_active_idx` ON `ecom_vit_purchase` (`deleted_at`,`cancelled_at`);--> statement-breakpoint
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
CREATE INDEX `sales_date_range_idx` ON `ecom_vit_sales` (`created_at`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `ecom_vit_user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`google_id` text,
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