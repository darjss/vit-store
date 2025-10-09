DROP INDEX `ecom_vit_product_slug_unique`;--> statement-breakpoint
ALTER TABLE `ecom_vit_product` ADD `tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `ecom_vit_product` ADD `is_featured` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ecom_vit_product` ADD `ingredients` text;--> statement-breakpoint
ALTER TABLE `ecom_vit_product` ADD `seo_title` text(256);--> statement-breakpoint
ALTER TABLE `ecom_vit_product` ADD `seo_description` text(512);--> statement-breakpoint
ALTER TABLE `ecom_vit_product` ADD `min_stock` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ecom_vit_product` ADD `weight_grams` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ecom_vit_product` ADD `origin_country` text(3);--> statement-breakpoint
ALTER TABLE `ecom_vit_product` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `product_deleted_at_idx` ON `ecom_vit_product` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `product_is_featured_idx` ON `ecom_vit_product` (`is_featured`);--> statement-breakpoint
ALTER TABLE `ecom_vit_brand` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `brand_deleted_at_idx` ON `ecom_vit_brand` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `ecom_vit_cart_item` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `cart_item_deleted_at_idx` ON `ecom_vit_cart_item` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `ecom_vit_cart` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `cart_deleted_at_idx` ON `ecom_vit_cart` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `ecom_vit_category` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `category_deleted_at_idx` ON `ecom_vit_category` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `ecom_vit_customer` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `customer_deleted_at_idx` ON `ecom_vit_customer` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `ecom_vit_order_detail` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `detail_deleted_at_idx` ON `ecom_vit_order_detail` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `ecom_vit_order` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `order_deleted_at_idx` ON `ecom_vit_order` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `ecom_vit_payment` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `payment_deleted_at_idx` ON `ecom_vit_payment` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `ecom_vit_product_image` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `image_deleted_at_idx` ON `ecom_vit_product_image` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `ecom_vit_purchase` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `purchase_deleted_at_idx` ON `ecom_vit_purchase` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `ecom_vit_sales` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `sales_deleted_at_idx` ON `ecom_vit_sales` (`deleted_at`);--> statement-breakpoint
ALTER TABLE `ecom_vit_user` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `user_deleted_at_idx` ON `ecom_vit_user` (`deleted_at`);
--> statement-breakpoint
-- Enforce slug uniqueness only for active (non-deleted) products
CREATE UNIQUE INDEX `ecom_vit_product_slug_active_idx` ON `ecom_vit_product` ("slug") WHERE deleted_at IS NULL;