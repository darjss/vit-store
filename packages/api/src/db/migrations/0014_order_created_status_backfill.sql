-- Backfill unpaid orders to the new "created" status.
-- Orders start as "created" (payment not yet confirmed). When payment is
-- confirmed they move to "pending" (paid, awaiting shipment). Existing orders
-- without a successful payment are reclassified from "pending" to "created";
-- orders with a successful payment stay "pending".

UPDATE "ecom_vit_order" o
SET status = 'created'
WHERE o.status = 'pending'
  AND o.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ecom_vit_payment" p
    WHERE p.order_id = o.id
      AND p.status = 'success'
      AND p.deleted_at IS NULL
  );
