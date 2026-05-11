CREATE UNIQUE INDEX IF NOT EXISTS "order_number_unique_idx" ON "ecom_vit_order" ("order_number");
CREATE UNIQUE INDEX IF NOT EXISTS "payment_number_unique_idx" ON "ecom_vit_payment" ("payment_number");
