CREATE TABLE "ecom_vit_checkout_idempotency" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_checkout_idempotency_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key_hash" varchar(64) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"order_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"notification_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_payment_post_commit_recovery" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_payment_post_commit_recovery_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_number" varchar(10) NOT NULL,
	"effect" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claim_token" varchar(64),
	"claim_until" timestamp,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error_code" varchar(64),
	"last_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_qpay_invoice" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_qpay_invoice_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_number" varchar(10) NOT NULL,
	"provider_request_id" varchar(64) NOT NULL,
	"status" text NOT NULL,
	"claim_token" varchar(64) NOT NULL,
	"invoice_id" varchar(64),
	"response" jsonb,
	"last_error_code" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ecom_vit_checkout_idempotency" ADD CONSTRAINT "ecom_vit_checkout_idempotency_order_id_ecom_vit_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ecom_vit_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_checkout_idempotency" ADD CONSTRAINT "ecom_vit_checkout_idempotency_payment_id_ecom_vit_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."ecom_vit_payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_idempotency_key_hash_unique_idx" ON "ecom_vit_checkout_idempotency" USING btree ("key_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_idempotency_order_unique_idx" ON "ecom_vit_checkout_idempotency" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_idempotency_payment_unique_idx" ON "ecom_vit_checkout_idempotency" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_recovery_payment_effect_unique_idx" ON "ecom_vit_payment_post_commit_recovery" USING btree ("payment_number","effect");--> statement-breakpoint
CREATE INDEX "payment_recovery_status_created_idx" ON "ecom_vit_payment_post_commit_recovery" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "qpay_invoice_payment_unique_idx" ON "ecom_vit_qpay_invoice" USING btree ("payment_number");--> statement-breakpoint
CREATE UNIQUE INDEX "qpay_invoice_request_unique_idx" ON "ecom_vit_qpay_invoice" USING btree ("provider_request_id");--> statement-breakpoint
CREATE INDEX "qpay_invoice_status_idx" ON "ecom_vit_qpay_invoice" USING btree ("status");--> statement-breakpoint
CREATE INDEX "restock_sub_lease_idx" ON "ecom_vit_restock_subscription" USING btree ("lease_expires_at") WHERE "ecom_vit_restock_subscription"."deleted_at" is null and "ecom_vit_restock_subscription"."delivery_state" = 'sending';