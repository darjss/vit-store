// drizzle-local.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/db/schema.ts",
	out: "./src/db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: "postgres://postgres:postgres@localhost:5433/vitstore",
	},
	migrations: {
		schema: "public",
	},
});
