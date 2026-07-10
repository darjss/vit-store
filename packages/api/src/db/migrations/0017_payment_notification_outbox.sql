CREATE TABLE IF NOT EXISTS "ecom_vit_payment_notification_outbox" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "payment_number" varchar(10) NOT NULL,
  "purpose" varchar(64) NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "claim_token" varchar(64), "claim_until" timestamp,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamp NOT NULL DEFAULT now(),
  "last_error_code" varchar(64), "last_error_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(), "updated_at" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "payment_notification_payment_purpose_unique_idx" ON "ecom_vit_payment_notification_outbox" ("payment_number", "purpose");
CREATE INDEX IF NOT EXISTS "payment_notification_dispatch_idx" ON "ecom_vit_payment_notification_outbox" ("status", "next_attempt_at");
