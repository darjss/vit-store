import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "src/**/*.ts",
	sourcemap: true,
	dts: true,
	external: [
		"@trpc/server",
		"@trpc/client",
		"hono",
		"valibot",
		"drizzle-orm",
		"@vit/shared",
	],
});
