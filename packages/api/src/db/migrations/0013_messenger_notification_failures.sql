CREATE TABLE IF NOT EXISTS "ecom_vit_messenger_notification_failure" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"payment_number" varchar(10) NOT NULL,
	"purpose" varchar(64) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb NOT NULL,
	"error_message" text,
	"error_code" varchar(64),
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS "messenger_notification_payment_purpose_unique_idx"
	ON "ecom_vit_messenger_notification_failure" ("payment_number", "purpose");

CREATE INDEX IF NOT EXISTS "messenger_notification_status_created_idx"
	ON "ecom_vit_messenger_notification_failure" ("status", "created_at");
