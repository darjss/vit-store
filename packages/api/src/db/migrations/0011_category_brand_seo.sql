-- Add SEO and slug columns to brands and categories tables

ALTER TABLE "ecom_vit_brand"
	ADD COLUMN "slug" varchar(256) NOT NULL DEFAULT '',
	ADD COLUMN "description" text,
	ADD COLUMN "banner_image" varchar(512),
	ADD COLUMN "seo_title" varchar(256),
	ADD COLUMN "seo_description" varchar(512);

ALTER TABLE "ecom_vit_brand"
	ADD CONSTRAINT "ecom_vit_brand_slug_unique" UNIQUE("slug");

CREATE INDEX "brand_slug_idx" ON "ecom_vit_brand" USING btree ("slug");

ALTER TABLE "ecom_vit_category"
	ADD COLUMN "slug" varchar(256) NOT NULL DEFAULT '',
	ADD COLUMN "description" text,
	ADD COLUMN "banner_image" varchar(512),
	ADD COLUMN "seo_title" varchar(256),
	ADD COLUMN "seo_description" varchar(512);

ALTER TABLE "ecom_vit_category"
	ADD CONSTRAINT "ecom_vit_category_slug_unique" UNIQUE("slug");

CREATE INDEX "category_slug_idx" ON "ecom_vit_category" USING btree ("slug");
