CREATE TABLE "ecom_vit_khaan_consumed_transaction" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_khaan_consumed_transaction_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"fingerprint" varchar(64) NOT NULL,
	"payment_number" varchar(10) NOT NULL,
	"confirmed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "khaan_consumed_fingerprint_unique_idx" ON "ecom_vit_khaan_consumed_transaction" USING btree ("fingerprint");