import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({
	path: "../../.env",
});

export default defineConfig({
	schema: "../../packages/api/src/db/schema.ts",
	out: "../../packages/api/src/db/migrations",
	// DOCS: https://orm.drizzle.team/docs/guides/d1-http-with-drizzle-kit
	dialect: "postgresql",
	dbCredentials: {
		url: `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`,
	},
});
