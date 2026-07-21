ALTER TABLE "ecom_vit_restock_subscription"
	ADD COLUMN "delivery_state" text NOT NULL DEFAULT 'pending',
	ADD COLUMN "delivery_key" varchar(96),
	ADD COLUMN "claim_token" varchar(64),
	ADD COLUMN "lease_expires_at" timestamp,
	ADD COLUMN "attempt_count" integer NOT NULL DEFAULT 0,
	ADD COLUMN "next_attempt_at" timestamp NOT NULL DEFAULT now(),
	ADD COLUMN "terminal_at" timestamp,
	ADD COLUMN "last_error" text;
--> statement-breakpoint
UPDATE "ecom_vit_restock_subscription"
SET
	"delivery_key" = 'restock-' || "id"::text,
	"delivery_state" = CASE WHEN "deleted_at" IS NOT NULL THEN 'cancelled' WHEN "notified_at" IS NULL THEN 'pending' ELSE 'sent' END,
	"terminal_at" = COALESCE("notified_at", "deleted_at"),
	"contact" = CASE WHEN "notified_at" IS NULL AND "deleted_at" IS NULL THEN "contact" ELSE NULL END;
--> statement-breakpoint
ALTER TABLE "ecom_vit_restock_subscription" ALTER COLUMN "delivery_key" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "ecom_vit_restock_subscription" ALTER COLUMN "contact" DROP NOT NULL;
--> statement-breakpoint
DROP INDEX "restock_sub_open_unique_idx";
--> statement-breakpoint
DROP INDEX "restock_sub_product_open_idx";
--> statement-breakpoint
DROP INDEX "restock_sub_contact_open_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "restock_sub_open_unique_idx" ON "ecom_vit_restock_subscription" USING btree ("product_id", "channel", "contact") WHERE "deleted_at" IS NULL AND "delivery_state" IN ('pending', 'sending');
--> statement-breakpoint
CREATE INDEX "restock_sub_product_pending_idx" ON "ecom_vit_restock_subscription" USING btree ("product_id", "next_attempt_at", "id") WHERE "deleted_at" IS NULL AND "delivery_state" = 'pending';
--> statement-breakpoint
CREATE INDEX "restock_sub_contact_open_idx" ON "ecom_vit_restock_subscription" USING btree ("contact") WHERE "deleted_at" IS NULL AND "delivery_state" IN ('pending', 'sending');
--> statement-breakpoint
CREATE INDEX "restock_sub_lease_idx" ON "ecom_vit_restock_subscription" USING btree ("lease_expires_at") WHERE "deleted_at" IS NULL AND "delivery_state" = 'sending';
