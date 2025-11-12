ALTER TABLE "ecom_vit_product_image" ALTER COLUMN "is_primary" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ecom_vit_product_image" ALTER COLUMN "is_primary" SET DATA TYPE boolean USING is_primary::boolean;--> statement-breakpoint
ALTER TABLE "ecom_vit_product_image" ALTER COLUMN "is_primary" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "ecom_vit_product" ALTER COLUMN "is_featured" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ecom_vit_product" ALTER COLUMN "is_featured" SET DATA TYPE boolean USING is_featured::boolean;--> statement-breakpoint
ALTER TABLE "ecom_vit_product" ALTER COLUMN "is_featured" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "ecom_vit_user" ALTER COLUMN "is_approved" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ecom_vit_user" ALTER COLUMN "is_approved" SET DATA TYPE boolean USING is_approved::boolean;--> statement-breakpoint
ALTER TABLE "ecom_vit_user" ALTER COLUMN "is_approved" SET DEFAULT false;