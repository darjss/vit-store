import nkzw from "@nkzw/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({
	extends: [nkzw],
	ignorePatterns: [
		"**/dist/**",
		"**/.alchemy/**",
		"**/routeTree.gen.ts",
		"**/components/ui/**",
		"apps/storev2/src/components/starwind/**",
		"tools/oxlint/anti-slop/**",
		"**/.agents/**",
		"**/.cursor/**",
	],
	jsPlugins: [],
	overrides: [
		{
			files: ["**/*.astro", "**/*.vue", "**/*.svelte"],
			rules: { complexity: "off" },
		},
		{
			env: { browser: true },
			files: ["apps/storev2/**/*.astro"],
			rules: { complexity: "off" },
		},
		{
			files: ["apps/storev2/**"],
			plugins: ["eslint", "import", "jest", "typescript", "unicorn", "oxc"],
			rules: {
				"react/exhaustive-deps": "off",
				"react/jsx-key": "off",
				"react/no-unknown-property": "off",
				"react/rules-of-hooks": "off",
			},
		},
		{
			env: { node: true },
			files: ["apps/server/**", "apps/agent/**", "packages/**"],
			rules: { "eslint/no-console": "off", "no-console": "off" },
		},
	],
	rules: {
		complexity: ["error", { max: 15 }],
	},
});
