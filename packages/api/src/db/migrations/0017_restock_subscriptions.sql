CREATE TABLE "ecom_vit_restock_subscription" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_restock_subscription_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"channel" text NOT NULL,
	"contact" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"notified_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ecom_vit_restock_subscription" ADD CONSTRAINT "ecom_vit_restock_subscription_product_id_ecom_vit_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."ecom_vit_product"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "restock_sub_open_unique_idx" ON "ecom_vit_restock_subscription" USING btree ("product_id","channel","contact") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "restock_sub_product_open_idx" ON "ecom_vit_restock_subscription" USING btree ("product_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "restock_sub_contact_open_idx" ON "ecom_vit_restock_subscription" USING btree ("contact") WHERE "deleted_at" IS NULL;
