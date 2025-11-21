ALTER TABLE "ecom_vit_product"
ALTER COLUMN "ingredients" SET DATA TYPE jsonb USING
CASE
	WHEN "ingredients" IS NULL OR trim("ingredients") = '' THEN '[]'::jsonb
	ELSE "ingredients"::jsonb
END;--> statement-breakpoint
UPDATE "ecom_vit_product"
SET "ingredients" = '[]'::jsonb
WHERE "ingredients" IS NULL;--> statement-breakpoint
ALTER TABLE "ecom_vit_product" ALTER COLUMN "ingredients" SET DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "ecom_vit_product" ALTER COLUMN "ingredients" SET NOT NULL;