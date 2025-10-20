// drizzle-local.config.ts
import type { Config } from "drizzle-kit";

export default {
	schema: "./src/db/schema.ts",
	out: "./drizzle/local",
	dialect: "sqlite",
	dbCredentials: {
		url: "file:../../.alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject/4fea589dffe569f8ba071ec87ac0160124823fb6b357717ae164e87fbe3b243a.sqlite",
	},
} satisfies Config;
