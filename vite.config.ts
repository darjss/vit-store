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
	staged: {
		"*": "vp check --fix",
	},
	run: {
		tasks: {
			"admin:dev": {
				command: "alchemy dev --app admin --stage dev",
				cwd: "apps/admin",
				cache: false,
			},
			"server:dev": {
				command: "alchemy dev --app server --stage dev",
				cwd: "apps/server",
				cache: false,
			},
			"storev2:dev": {
				command: "NODE_TLS_REJECT_UNAUTHORIZED=0 alchemy dev --app storev2 --stage dev",
				cwd: "apps/storev2",
				cache: false,
			},
			"db:generate": {
				command: "vp exec drizzle-kit generate",
				cwd: "packages/api",
				cache: false,
			},
			"db:migrate:local": {
				command:
					"vp exec drizzle-kit migrate --config=../../packages/api/drizzle.local.config.ts",
				cwd: "apps/server",
				cache: false,
			},
		},
	},
});
