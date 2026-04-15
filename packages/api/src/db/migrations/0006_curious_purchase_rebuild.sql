ALTER TABLE "ecom_vit_purchase" ADD COLUMN "provider" text DEFAULT 'unknown' NOT NULL;
ALTER TABLE "ecom_vit_purchase" ADD COLUMN "external_order_number" varchar(128);
ALTER TABLE "ecom_vit_purchase" ADD COLUMN "tracking_number" varchar(128);
ALTER TABLE "ecom_vit_purchase" ADD COLUMN "shipping_cost" integer DEFAULT 0 NOT NULL;
ALTER TABLE "ecom_vit_purchase" ADD COLUMN "notes" text;
ALTER TABLE "ecom_vit_purchase" ADD COLUMN "ordered_at" timestamp;
ALTER TABLE "ecom_vit_purchase" ADD COLUMN "shipped_at" timestamp;
ALTER TABLE "ecom_vit_purchase" ADD COLUMN "forwarder_received_at" timestamp;
ALTER TABLE "ecom_vit_purchase" ADD COLUMN "received_at" timestamp;
ALTER TABLE "ecom_vit_purchase" ADD COLUMN "cancelled_at" timestamp;

UPDATE "ecom_vit_purchase"
SET
	"external_order_number" = 'legacy-' || "id",
	"ordered_at" = "created_at",
	"received_at" = "created_at"
WHERE "external_order_number" IS NULL;

ALTER TABLE "ecom_vit_purchase" ALTER COLUMN "external_order_number" SET NOT NULL;

CREATE TABLE "ecom_vit_purchase_item" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
	"purchase_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity_ordered" integer NOT NULL,
	"unit_cost" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);

CREATE TABLE "ecom_vit_purchase_receipt" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
	"purchase_id" integer NOT NULL,
	"received_at" timestamp NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);

CREATE TABLE "ecom_vit_purchase_receipt_item" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
	"receipt_id" integer NOT NULL,
	"purchase_item_id" integer NOT NULL,
	"quantity_received" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"deleted_at" timestamp
);

ALTER TABLE "ecom_vit_purchase_item"
	ADD CONSTRAINT "ecom_vit_purchase_item_purchase_id_ecom_vit_purchase_id_fk"
	FOREIGN KEY ("purchase_id") REFERENCES "public"."ecom_vit_purchase"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ecom_vit_purchase_item"
	ADD CONSTRAINT "ecom_vit_purchase_item_product_id_ecom_vit_product_id_fk"
	FOREIGN KEY ("product_id") REFERENCES "public"."ecom_vit_product"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "ecom_vit_purchase_receipt"
	ADD CONSTRAINT "ecom_vit_purchase_receipt_purchase_id_ecom_vit_purchase_id_fk"
	FOREIGN KEY ("purchase_id") REFERENCES "public"."ecom_vit_purchase"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ecom_vit_purchase_receipt_item"
	ADD CONSTRAINT "ecom_vit_purchase_receipt_item_receipt_id_ecom_vit_purchase_receipt_id_fk"
	FOREIGN KEY ("receipt_id") REFERENCES "public"."ecom_vit_purchase_receipt"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "ecom_vit_purchase_receipt_item"
	ADD CONSTRAINT "ecom_vit_purchase_receipt_item_purchase_item_id_ecom_vit_purchase_item_id_fk"
	FOREIGN KEY ("purchase_item_id") REFERENCES "public"."ecom_vit_purchase_item"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX "purchase_provider_idx" ON "ecom_vit_purchase" USING btree ("provider");
CREATE INDEX "purchase_external_order_idx" ON "ecom_vit_purchase" USING btree ("external_order_number");
CREATE INDEX "purchase_tracking_number_idx" ON "ecom_vit_purchase" USING btree ("tracking_number");
CREATE INDEX "purchase_ordered_at_idx" ON "ecom_vit_purchase" USING btree ("ordered_at");
CREATE INDEX "purchase_received_at_idx" ON "ecom_vit_purchase" USING btree ("received_at");
CREATE INDEX "purchase_cancelled_at_idx" ON "ecom_vit_purchase" USING btree ("cancelled_at");
CREATE INDEX "purchase_item_purchase_idx" ON "ecom_vit_purchase_item" USING btree ("purchase_id");
CREATE INDEX "purchase_item_product_idx" ON "ecom_vit_purchase_item" USING btree ("product_id");
CREATE INDEX "purchase_item_deleted_at_idx" ON "ecom_vit_purchase_item" USING btree ("deleted_at");
CREATE INDEX "purchase_receipt_purchase_idx" ON "ecom_vit_purchase_receipt" USING btree ("purchase_id");
CREATE INDEX "purchase_receipt_received_at_idx" ON "ecom_vit_purchase_receipt" USING btree ("received_at");
CREATE INDEX "purchase_receipt_deleted_at_idx" ON "ecom_vit_purchase_receipt" USING btree ("deleted_at");
CREATE INDEX "purchase_receipt_item_receipt_idx" ON "ecom_vit_purchase_receipt_item" USING btree ("receipt_id");
CREATE INDEX "purchase_receipt_item_purchase_item_idx" ON "ecom_vit_purchase_receipt_item" USING btree ("purchase_item_id");
CREATE INDEX "purchase_receipt_item_deleted_at_idx" ON "ecom_vit_purchase_receipt_item" USING btree ("deleted_at");

WITH inserted_items AS (
	INSERT INTO "ecom_vit_purchase_item" (
		"purchase_id",
		"product_id",
		"quantity_ordered",
		"unit_cost",
		"created_at",
		"updated_at",
		"deleted_at"
	)
	SELECT
		"id",
		"product_id",
		"quantity_purchased",
		"unit_cost",
		"created_at",
		"updated_at",
		"deleted_at"
	FROM "ecom_vit_purchase"
	RETURNING "id", "purchase_id", "quantity_ordered", "created_at", "updated_at", "deleted_at"
),
inserted_receipts AS (
	INSERT INTO "ecom_vit_purchase_receipt" (
		"purchase_id",
		"received_at",
		"notes",
		"created_at",
		"updated_at",
		"deleted_at"
	)
	SELECT
		"purchase_id",
		"created_at",
		'Migrated from legacy purchase row',
		"created_at",
		"updated_at",
		"deleted_at"
	FROM inserted_items
	RETURNING "id", "purchase_id"
)
INSERT INTO "ecom_vit_purchase_receipt_item" (
	"receipt_id",
	"purchase_item_id",
	"quantity_received",
	"created_at",
	"updated_at",
	"deleted_at"
)
SELECT
	inserted_receipts."id",
	inserted_items."id",
	inserted_items."quantity_ordered",
	inserted_items."created_at",
	inserted_items."updated_at",
	inserted_items."deleted_at"
FROM inserted_items
INNER JOIN inserted_receipts
	ON inserted_receipts."purchase_id" = inserted_items."purchase_id";

DROP INDEX IF EXISTS "purchase_product_idx";
DROP INDEX IF EXISTS "purchase_product_created_idx";

ALTER TABLE "ecom_vit_purchase" DROP COLUMN "product_id";
ALTER TABLE "ecom_vit_purchase" DROP COLUMN "quantity_purchased";
ALTER TABLE "ecom_vit_purchase" DROP COLUMN "unit_cost";
