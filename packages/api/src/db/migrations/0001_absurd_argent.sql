CREATE TABLE `ecom_vit_restock_subscription` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`channel` text NOT NULL,
	`contact` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer DEFAULT (unixepoch() + 2592000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `ecom_vit_product`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `restock_subscription_unique_idx` ON `ecom_vit_restock_subscription` (`product_id`,`channel`,`contact`);--> statement-breakpoint
CREATE INDEX `restock_subscription_product_idx` ON `ecom_vit_restock_subscription` (`product_id`);--> statement-breakpoint
CREATE INDEX `restock_subscription_expires_idx` ON `ecom_vit_restock_subscription` (`expires_at`);