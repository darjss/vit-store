import { defineConfig } from "vite-plus";

import formatConfig from "./oxfmt.config";
import lintConfig from "./oxlint.config";

export default defineConfig({
	fmt: {
		...formatConfig,
	},
	lint: {
		...lintConfig,
		jsPlugins: [
			...(lintConfig.jsPlugins ?? []),
			{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
		],
		options: { typeAware: false, typeCheck: false },
		rules: {
			...lintConfig.rules,
			"vite-plus/prefer-vite-plus-imports": "error",
		},
	},
	run: {
		tasks: {
			"admin:dev": {
				cache: false,
				command: "alchemy dev --app admin --stage dev",
				cwd: "apps/admin",
			},
			"db:generate": {
				cache: false,
				command: "vp exec drizzle-kit generate",
				cwd: "packages/api",
			},
			"db:migrate:local": {
				cache: false,
				command: "vp exec drizzle-kit migrate --config=../../packages/api/drizzle.local.config.ts",
				cwd: "apps/server",
			},
			"server:dev": {
				cache: false,
				command: "alchemy dev --app server --stage dev",
				cwd: "apps/server",
			},
			"storev2:dev": {
				cache: false,
				command: "NODE_TLS_REJECT_UNAUTHORIZED=0 alchemy dev --app storev2 --stage dev",
				cwd: "apps/storev2",
			},
		},
	},
	staged: {
		"*": "vp check --fix",
	},
});
