CREATE TABLE "ecom_vit_ops_token" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ecom_vit_ops_token_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(128) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "ecom_vit_ops_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "ecom_vit_ops_token" ADD CONSTRAINT "ecom_vit_ops_token_user_id_ecom_vit_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."ecom_vit_user"("id") ON DELETE no action ON UPDATE no action;