ALTER TABLE "ecom_vit_restock_subscription"
	ADD COLUMN "consent_state" text NOT NULL DEFAULT 'pending';
--> statement-breakpoint
UPDATE "ecom_vit_restock_subscription"
SET
	"delivery_state" = 'cancelled',
	"terminal_at" = now(),
	"contact" = NULL,
	"claim_token" = NULL,
	"lease_expires_at" = NULL,
	"last_error" = 'legacy subscription cancelled: ownership was not verified'
WHERE "deleted_at" IS NULL AND "delivery_state" IN ('pending', 'sending');
--> statement-breakpoint
DROP INDEX "restock_sub_open_unique_idx";
--> statement-breakpoint
DROP INDEX "restock_sub_product_pending_idx";
--> statement-breakpoint
DROP INDEX "restock_sub_contact_open_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "restock_sub_open_unique_idx" ON "ecom_vit_restock_subscription" USING btree ("product_id", "channel", "contact") WHERE "deleted_at" IS NULL AND "consent_state" = 'verified' AND "delivery_state" IN ('pending', 'sending');
--> statement-breakpoint
CREATE INDEX "restock_sub_product_pending_idx" ON "ecom_vit_restock_subscription" USING btree ("product_id", "next_attempt_at", "id") WHERE "deleted_at" IS NULL AND "consent_state" = 'verified' AND "delivery_state" = 'pending';
--> statement-breakpoint
CREATE INDEX "restock_sub_contact_open_idx" ON "ecom_vit_restock_subscription" USING btree ("contact") WHERE "deleted_at" IS NULL AND "consent_state" = 'verified' AND "delivery_state" IN ('pending', 'sending');
