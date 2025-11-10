ALTER TABLE `ecom_vit_payment` ADD `payment_number` text(10) DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `payment_number_idx` ON `ecom_vit_payment` (`payment_number`);