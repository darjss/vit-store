CREATE TABLE "ecom_vit_brand" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_brand_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(256) NOT NULL,
	"logo_url" varchar(512) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "ecom_vit_brand_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_cart_item" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_cart_item_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cart_id" integer NOT NULL,
	"product_variant_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_cart" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_cart_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_category" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_category_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "ecom_vit_category_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_customer" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_customer_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"phone" integer NOT NULL,
	"address" varchar(256),
	"facebook_username" varchar(256),
	"instagram_username" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "ecom_vit_customer_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_order_detail" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_order_detail_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_order" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_order_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_number" varchar(8) NOT NULL,
	"customer_phone" integer NOT NULL,
	"status" text NOT NULL,
	"address" varchar(256) NOT NULL,
	"delivery_provider" text NOT NULL,
	"total" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_payment" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_payment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_number" varchar(10) DEFAULT '' NOT NULL,
	"order_id" integer NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_product_image" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_product_image_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"url" varchar(512) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_product" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_product_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(256) NOT NULL,
	"slug" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"discount" integer DEFAULT 0 NOT NULL,
	"amount" varchar(15) NOT NULL,
	"potency" varchar(256) NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"price" integer NOT NULL,
	"daily_intake" integer DEFAULT 0 NOT NULL,
	"category_id" integer NOT NULL,
	"brand_id" integer NOT NULL,
	"tags" text DEFAULT '[]'::jsonb NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"ingredients" text,
	"seo_title" varchar(256),
	"seo_description" varchar(512),
	"weight_grams" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_purchase" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_purchase_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"quantity_purchased" integer NOT NULL,
	"unit_cost" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_sales" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_sales_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" integer NOT NULL,
	"order_id" integer NOT NULL,
	"quantity_sold" integer NOT NULL,
	"product_cost" integer NOT NULL,
	"selling_price" integer NOT NULL,
	"discount_applied" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ecom_vit_user" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"username" varchar(256) NOT NULL,
	"google_id" varchar(256),
	"is_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp,
	CONSTRAINT "ecom_vit_user_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
ALTER TABLE "ecom_vit_cart_item" ADD CONSTRAINT "ecom_vit_cart_item_cart_id_ecom_vit_cart_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."ecom_vit_cart"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_cart_item" ADD CONSTRAINT "ecom_vit_cart_item_product_variant_id_ecom_vit_product_id_fk" FOREIGN KEY ("product_variant_id") REFERENCES "public"."ecom_vit_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_cart" ADD CONSTRAINT "ecom_vit_cart_customer_id_ecom_vit_customer_phone_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."ecom_vit_customer"("phone") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_order_detail" ADD CONSTRAINT "ecom_vit_order_detail_order_id_ecom_vit_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ecom_vit_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_order_detail" ADD CONSTRAINT "ecom_vit_order_detail_product_id_ecom_vit_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."ecom_vit_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_order" ADD CONSTRAINT "ecom_vit_order_customer_phone_ecom_vit_customer_phone_fk" FOREIGN KEY ("customer_phone") REFERENCES "public"."ecom_vit_customer"("phone") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_payment" ADD CONSTRAINT "ecom_vit_payment_order_id_ecom_vit_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ecom_vit_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_product_image" ADD CONSTRAINT "ecom_vit_product_image_product_id_ecom_vit_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."ecom_vit_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_product" ADD CONSTRAINT "ecom_vit_product_category_id_ecom_vit_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."ecom_vit_category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_product" ADD CONSTRAINT "ecom_vit_product_brand_id_ecom_vit_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."ecom_vit_brand"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_purchase" ADD CONSTRAINT "ecom_vit_purchase_product_id_ecom_vit_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."ecom_vit_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_sales" ADD CONSTRAINT "ecom_vit_sales_product_id_ecom_vit_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."ecom_vit_product"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecom_vit_sales" ADD CONSTRAINT "ecom_vit_sales_order_id_ecom_vit_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."ecom_vit_order"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brand_name_idx" ON "ecom_vit_brand" USING btree ("name");--> statement-breakpoint
CREATE INDEX "brand_created_at_idx" ON "ecom_vit_brand" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "brand_deleted_at_idx" ON "ecom_vit_brand" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cart_item_cart_idx" ON "ecom_vit_cart_item" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "cart_item_product_idx" ON "ecom_vit_cart_item" USING btree ("product_variant_id");--> statement-breakpoint
CREATE INDEX "cart_item_deleted_at_idx" ON "ecom_vit_cart_item" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "cart_customer_idx" ON "ecom_vit_cart" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cart_created_at_idx" ON "ecom_vit_cart" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "cart_deleted_at_idx" ON "ecom_vit_cart" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "category_name_idx" ON "ecom_vit_category" USING btree ("name");--> statement-breakpoint
CREATE INDEX "category_created_at_idx" ON "ecom_vit_category" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "category_deleted_at_idx" ON "ecom_vit_category" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "phone_idx" ON "ecom_vit_customer" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customer_created_at_idx" ON "ecom_vit_customer" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "customer_deleted_at_idx" ON "ecom_vit_customer" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "detail_order_idx" ON "ecom_vit_order_detail" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "detail_product_idx" ON "ecom_vit_order_detail" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "detail_deleted_at_idx" ON "ecom_vit_order_detail" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "order_id_idx" ON "ecom_vit_order" USING btree ("id");--> statement-breakpoint
CREATE INDEX "order_customer_idx" ON "ecom_vit_order" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "order_number_idx" ON "ecom_vit_order" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "order_status_idx" ON "ecom_vit_order" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_created_at_idx" ON "ecom_vit_order" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_deleted_at_idx" ON "ecom_vit_order" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "payment_order_idx" ON "ecom_vit_payment" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payment_number_idx" ON "ecom_vit_payment" USING btree ("payment_number");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "ecom_vit_payment" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_created_at_idx" ON "ecom_vit_payment" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payment_deleted_at_idx" ON "ecom_vit_payment" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "image_product_idx" ON "ecom_vit_product_image" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "image_product_primary_idx" ON "ecom_vit_product_image" USING btree ("product_id","is_primary");--> statement-breakpoint
CREATE INDEX "image_deleted_at_idx" ON "ecom_vit_product_image" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "product_id_idx" ON "ecom_vit_product" USING btree ("id");--> statement-breakpoint
CREATE INDEX "product_name_idx" ON "ecom_vit_product" USING btree ("name");--> statement-breakpoint
CREATE INDEX "product_status_idx" ON "ecom_vit_product" USING btree ("status");--> statement-breakpoint
CREATE INDEX "product_category_idx" ON "ecom_vit_product" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "product_brand_idx" ON "ecom_vit_product" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "product_stock_idx" ON "ecom_vit_product" USING btree ("stock");--> statement-breakpoint
CREATE INDEX "product_price_idx" ON "ecom_vit_product" USING btree ("price");--> statement-breakpoint
CREATE INDEX "product_created_at_idx" ON "ecom_vit_product" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "product_deleted_at_idx" ON "ecom_vit_product" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "product_is_featured_idx" ON "ecom_vit_product" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "purchase_id_idx" ON "ecom_vit_purchase" USING btree ("id");--> statement-breakpoint
CREATE INDEX "purchase_product_idx" ON "ecom_vit_purchase" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "purchase_created_idx" ON "ecom_vit_purchase" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "purchase_product_created_idx" ON "ecom_vit_purchase" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "purchase_deleted_at_idx" ON "ecom_vit_purchase" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "sales_product_idx" ON "ecom_vit_sales" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sales_created_at_idx" ON "ecom_vit_sales" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sales_product_created_idx" ON "ecom_vit_sales" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "sales_deleted_at_idx" ON "ecom_vit_sales" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "username_idx" ON "ecom_vit_user" USING btree ("username");--> statement-breakpoint
CREATE INDEX "google_id_idx" ON "ecom_vit_user" USING btree ("google_id");--> statement-breakpoint
CREATE INDEX "user_created_at_idx" ON "ecom_vit_user" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_deleted_at_idx" ON "ecom_vit_user" USING btree ("deleted_at");