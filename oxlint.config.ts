import nkzw from "@nkzw/oxlint-config";
import { defineConfig } from "oxlint";

const antiSlopRules = {
	"anti-slop/no-chained-type-assertions": "error",
	"anti-slop/no-conditional-empty-object-spread": "error",
	"anti-slop/no-known-value-widening": "error",
	"anti-slop/no-module-mocking": "error",
	"anti-slop/no-object-parameters": "error",
	"anti-slop/no-reflect-apply": "error",
	"anti-slop/no-reflect-get": "error",
	"anti-slop/no-runtime-typeof": "error",
	"anti-slop/no-shape-in-symbol-names": "error",
	"anti-slop/no-unknown-parameters": "error",
	"anti-slop/no-unknown-returns": "error",
	"anti-slop/no-unknown-type-aliases": "error",
	"anti-slop/no-unsafe-dictionary-type": "error",
	"anti-slop/no-widen-then-assert": "error",
	"anti-slop/require-safety-comment-for-type-assertion": "error",
} as const;

const storev2ReactOff = {
	"react/exhaustive-deps": "off",
	"react/immutability": "off",
	"react/incompatible-library": "off",
	"react/jsx-key": "off",
	"react/no-children-prop": "off",
	"react/no-unescaped-entities": "off",
	"react/no-unknown-property": "off",
	"react/purity": "off",
	"react/refs": "off",
	"react/rules-of-hooks": "off",
	"react/set-state-in-effect": "off",
	"react/static-components": "off",
	"react/use-memo": "off",
	"react-hooks/exhaustive-deps": "off",
	"react-hooks/rules-of-hooks": "off",
} as const;

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
		"apps/agent/.flue/**",
		"packages/api/src/db/schema.d.ts",
	],
	jsPlugins: [{ name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" }],
	overrides: [
		{
			env: { astro: true, browser: true },
			files: ["**/*.astro"],
			rules: { complexity: "off", ...storev2ReactOff },
		},
		{
			env: { browser: true, node: true },
			files: ["apps/storev2/**"],
			plugins: ["eslint", "import", "jest", "typescript", "unicorn", "oxc"],
			rules: {
				...storev2ReactOff,
				"eslint/no-console": "warn",
				"no-console": "warn",
			},
		},
		{
			env: { node: true },
			files: ["apps/server/**", "apps/agent/**", "packages/**"],
			rules: {
				"@nkzw/no-instanceof": "off",
				"eslint/no-console": "off",
				"import/no-namespace": "off",
				"no-console": "off",
			},
		},
		{
			files: ["**/env.d.ts"],
			rules: {
				"anti-slop/no-unsafe-dictionary-type": "off",
				"typescript/triple-slash-reference": "off",
			},
		},
		{
			files: ["**/alchemy.run.ts"],
			rules: {
				"anti-slop/no-conditional-empty-object-spread": "off",
				"perfectionist/sort-object-types": "off",
			},
		},
		{
			env: { browser: true },
			files: ["apps/admin/**"],
			rules: { "eslint/no-console": "warn" },
		},
	],
	rules: {
		complexity: ["error", { max: 15 }],
		...antiSlopRules,
	},
});
