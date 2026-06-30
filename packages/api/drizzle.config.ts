import { defineConfig } from "drizzle-kit";

// D1 is SQLite. Migrations are generated here with drizzle-kit and applied to
// the D1 database by Alchemy (see apps/server/alchemy.run.ts `migrationsDir`).
export default defineConfig({
	schema: "../../packages/api/src/db/schema.ts",
	out: "../../packages/api/src/db/migrations",
	dialect: "sqlite",
});
