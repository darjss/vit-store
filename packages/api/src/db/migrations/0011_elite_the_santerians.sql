CREATE TABLE "ecom_vit_messenger_notification_failure" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_messenger_notification_failure_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_number" varchar(10) NOT NULL,
	"purpose" varchar(64) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"error_message" text,
	"error_code" varchar(64),
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
DROP INDEX "order_number_idx";--> statement-breakpoint
DROP INDEX "payment_number_idx";--> statement-breakpoint
ALTER TABLE "ecom_vit_brand" ADD COLUMN "slug" varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE "ecom_vit_brand" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "ecom_vit_brand" ADD COLUMN "banner_image" varchar(512);--> statement-breakpoint
ALTER TABLE "ecom_vit_brand" ADD COLUMN "seo_title" varchar(256);--> statement-breakpoint
ALTER TABLE "ecom_vit_brand" ADD COLUMN "seo_description" varchar(512);--> statement-breakpoint
ALTER TABLE "ecom_vit_category" ADD COLUMN "slug" varchar(256) NOT NULL;--> statement-breakpoint
ALTER TABLE "ecom_vit_category" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "ecom_vit_category" ADD COLUMN "banner_image" varchar(512);--> statement-breakpoint
ALTER TABLE "ecom_vit_category" ADD COLUMN "seo_title" varchar(256);--> statement-breakpoint
ALTER TABLE "ecom_vit_category" ADD COLUMN "seo_description" varchar(512);--> statement-breakpoint
CREATE UNIQUE INDEX "messenger_notification_payment_purpose_unique_idx" ON "ecom_vit_messenger_notification_failure" USING btree ("payment_number","purpose");--> statement-breakpoint
CREATE INDEX "messenger_notification_status_created_idx" ON "ecom_vit_messenger_notification_failure" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "brand_slug_idx" ON "ecom_vit_brand" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "category_slug_idx" ON "ecom_vit_category" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "order_number_unique_idx" ON "ecom_vit_order" USING btree ("order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_number_unique_idx" ON "ecom_vit_payment" USING btree ("payment_number");--> statement-breakpoint
ALTER TABLE "ecom_vit_brand" ADD CONSTRAINT "ecom_vit_brand_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "ecom_vit_category" ADD CONSTRAINT "ecom_vit_category_slug_unique" UNIQUE("slug");