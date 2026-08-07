CREATE TABLE "ecom_vit_delivery_dispatch" (
	"order_id" integer PRIMARY KEY NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"delivery_date" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ecom_vit_delivery_dispatch" ADD CONSTRAINT "ecom_vit_delivery_dispatch_order_id_ecom_vit_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ecom_vit_order"("id") ON DELETE cascade ON UPDATE no action;