-- Add amount column (nullable first for existing records)
ALTER TABLE `ecom_vit_payment` ADD `amount` integer;--> statement-breakpoint

-- Update existing payments with the order total amount
UPDATE `ecom_vit_payment` 
SET `amount` = (
  SELECT total 
  FROM `ecom_vit_order` 
  WHERE `ecom_vit_order`.id = `ecom_vit_payment`.order_id
)
WHERE `amount` IS NULL;--> statement-breakpoint

-- Now recreate the table with NOT NULL constraint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ecom_vit_payment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_number` text(10) DEFAULT '' NOT NULL,
	`order_id` integer NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer,
	FOREIGN KEY (`order_id`) REFERENCES `ecom_vit_order`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_ecom_vit_payment`("id", "payment_number", "order_id", "provider", "status", "amount", "created_at", "updated_at", "deleted_at") SELECT "id", "payment_number", "order_id", "provider", "status", "amount", "created_at", "updated_at", "deleted_at" FROM `ecom_vit_payment`;--> statement-breakpoint
DROP TABLE `ecom_vit_payment`;--> statement-breakpoint
ALTER TABLE `__new_ecom_vit_payment` RENAME TO `ecom_vit_payment`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `payment_order_idx` ON `ecom_vit_payment` (`order_id`);--> statement-breakpoint
CREATE INDEX `payment_number_idx` ON `ecom_vit_payment` (`payment_number`);--> statement-breakpoint
CREATE INDEX `payment_status_idx` ON `ecom_vit_payment` (`status`);--> statement-breakpoint
CREATE INDEX `payment_created_at_idx` ON `ecom_vit_payment` (`created_at`);--> statement-breakpoint
CREATE INDEX `payment_deleted_at_idx` ON `ecom_vit_payment` (`deleted_at`);