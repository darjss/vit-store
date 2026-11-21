ALTER TABLE "ecom_vit_delivery_dispatch" ADD COLUMN "driver_comment" text;--> statement-breakpoint
ALTER TABLE "ecom_vit_delivery_dispatch" ADD COLUMN "driver_name" varchar(128);--> statement-breakpoint
ALTER TABLE "ecom_vit_delivery_dispatch" ADD COLUMN "last_event_key" varchar(128);--> statement-breakpoint
ALTER TABLE "ecom_vit_delivery_dispatch" ADD COLUMN "tu_order_id" integer;--> statement-breakpoint
ALTER TABLE "ecom_vit_delivery_dispatch" ADD COLUMN "tu_status" varchar(32);--> statement-breakpoint
ALTER TABLE "ecom_vit_delivery_dispatch" ADD COLUMN "tu_status_name" varchar(128);--> statement-breakpoint
ALTER TABLE "ecom_vit_delivery_dispatch" ADD COLUMN "tu_updated_at" varchar(32);--> statement-breakpoint
ALTER TABLE "ecom_vit_delivery_dispatch" ADD COLUMN "updated_at" timestamp;