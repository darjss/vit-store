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
});
