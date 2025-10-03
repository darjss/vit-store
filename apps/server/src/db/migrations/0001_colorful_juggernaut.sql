PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ecom_vit_brand` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text(256) NOT NULL,
	`logo_url` text(512) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_ecom_vit_brand`("id", "name", "logo_url", "created_at", "updated_at") SELECT "id", "name", "logo_url", "created_at", "updated_at" FROM `ecom_vit_brand`;--> statement-breakpoint
DROP TABLE `ecom_vit_brand`;--> statement-breakpoint
ALTER TABLE `__new_ecom_vit_brand` RENAME TO `ecom_vit_brand`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `ecom_vit_brand_name_unique` ON `ecom_vit_brand` (`name`);--> statement-breakpoint
CREATE INDEX `brand_name_idx` ON `ecom_vit_brand` (`name`);--> statement-breakpoint
CREATE INDEX `brand_created_at_idx` ON `ecom_vit_brand` (`created_at`);