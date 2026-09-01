import oxlintConfig from "./.oxlintrc.json" with { type: "json" };
import { defineConfig } from "vite-plus";

const sharedIgnorePatterns = [
	"**/node_modules/**",
	"**/.next/**",
	"**/dist/**",
	"**/generated/**",
	"**/.turbo/**",
	"**/tmp/**",
	"**/.bun/**",
	"**/dev-dist/**",
	"**/.zed/**",
	"**/.vscode/**",
	"**/routeTree.gen.ts",
	"**/.nuxt/**",
	"**/.wrangler/**",
	"**/.alchemy/**",
	"**/dev.log",
	"**/public/**",
	"**/components/ui/**",
	"**/.astro/**",
	"**/vit/**",
	"**/*.sql",
	"**/migrations/meta/**",
	"apps/storev2/src/components/starwind/**",
	"**/.agents/**",
	"**/.cursor/**",
	"plans/**",
];

export default defineConfig({
	fmt: {
		useTabs: true,
		singleQuote: false,
		ignorePatterns: sharedIgnorePatterns,
	},
	lint: {
		...oxlintConfig,
		ignorePatterns: [...(oxlintConfig.ignorePatterns ?? []), ...sharedIgnorePatterns],
	},
});
