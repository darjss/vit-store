-- F8: non-unique index on khaan_consumed_transaction.payment_number to make
-- replay/debugging lookups ("which fingerprints did payment X consume?") an
-- index scan instead of a full table scan. 0015 is already applied on the
-- shared DB, so this is a new forward-only migration rather than an edit to
-- 0015 (editing an applied migration would desync drizzle's journal).
CREATE INDEX "khaan_consumed_payment_number_idx" ON "ecom_vit_khaan_consumed_transaction" USING btree ("payment_number");
