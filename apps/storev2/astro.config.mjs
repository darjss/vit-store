import solidJs from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";
import alchemy from "alchemy/cloudflare/astro";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	output: "server",
	adapter: alchemy({
		imageService:"cloudflare"
	}),
	
	prefetch: {
		strategy: "tap",
	},
	vite: {
		plugins: [tailwindcss()],

		server: {
			allowedHosts: ["vitstore.dev"],
		},

		optimizeDeps: {
			include: [
				"@tanstack/solid-query",
				"@tanstack/solid-query-devtools",
				"@solid-primitives/storage",
				"solid-js",
				"solid-js/web",
				"solid-js/store",
			],
		},

		ssr: {
			noExternal: ["@solid-primitives/storage"],
		},
	},

	integrations: [solidJs()],
});
