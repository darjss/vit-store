DROP INDEX "customer_deleted_at_idx";--> statement-breakpoint
DROP INDEX "order_created_at_idx";--> statement-breakpoint
DROP INDEX "order_deleted_at_idx";--> statement-breakpoint
DROP INDEX "payment_status_idx";--> statement-breakpoint
DROP INDEX "payment_deleted_at_idx";--> statement-breakpoint
DROP INDEX "image_deleted_at_idx";--> statement-breakpoint
DROP INDEX "product_status_idx";--> statement-breakpoint
DROP INDEX "product_created_at_idx";--> statement-breakpoint
DROP INDEX "product_deleted_at_idx";--> statement-breakpoint
DROP INDEX "product_is_featured_idx";--> statement-breakpoint
DROP INDEX "purchase_item_deleted_at_idx";--> statement-breakpoint
DROP INDEX "purchase_cancelled_at_idx";--> statement-breakpoint
DROP INDEX "purchase_deleted_at_idx";--> statement-breakpoint
DROP INDEX "sales_deleted_at_idx";--> statement-breakpoint
CREATE INDEX "customer_admin_list_idx" ON "ecom_vit_customer" USING btree ("deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "order_admin_list_idx" ON "ecom_vit_order" USING btree ("deleted_at","status","created_at");--> statement-breakpoint
CREATE INDEX "order_date_range_idx" ON "ecom_vit_order" USING btree ("deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "order_customer_deleted_idx" ON "ecom_vit_order" USING btree ("customer_phone","deleted_at");--> statement-breakpoint
CREATE INDEX "payment_status_created_idx" ON "ecom_vit_payment" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payment_number_status_idx" ON "ecom_vit_payment" USING btree ("payment_number","status");--> statement-breakpoint
CREATE INDEX "image_product_deleted_primary_idx" ON "ecom_vit_product_image" USING btree ("product_id","deleted_at","is_primary");--> statement-breakpoint
CREATE INDEX "product_store_list_created_idx" ON "ecom_vit_product" USING btree ("deleted_at","status","created_at","id");--> statement-breakpoint
CREATE INDEX "product_store_list_price_idx" ON "ecom_vit_product" USING btree ("deleted_at","status","price","id");--> statement-breakpoint
CREATE INDEX "product_store_list_stock_idx" ON "ecom_vit_product" USING btree ("deleted_at","status","stock","id");--> statement-breakpoint
CREATE INDEX "product_featured_store_idx" ON "ecom_vit_product" USING btree ("is_featured","status","deleted_at","updated_at");--> statement-breakpoint
CREATE INDEX "product_category_store_idx" ON "ecom_vit_product" USING btree ("category_id","deleted_at","status","updated_at");--> statement-breakpoint
CREATE INDEX "product_brand_store_idx" ON "ecom_vit_product" USING btree ("brand_id","deleted_at","status","updated_at");--> statement-breakpoint
CREATE INDEX "purchase_item_purchase_deleted_idx" ON "ecom_vit_purchase_item" USING btree ("purchase_id","deleted_at");--> statement-breakpoint
CREATE INDEX "purchase_item_product_deleted_idx" ON "ecom_vit_purchase_item" USING btree ("product_id","deleted_at");--> statement-breakpoint
CREATE INDEX "purchase_active_idx" ON "ecom_vit_purchase" USING btree ("deleted_at","cancelled_at");--> statement-breakpoint
CREATE INDEX "sales_date_range_idx" ON "ecom_vit_sales" USING btree ("created_at","deleted_at");