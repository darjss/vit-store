// @ts-check
import cloudflare from "@astrojs/cloudflare";
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	adapter: cloudflare({
		platformProxy: {
			enabled: true,
		},

		imageService: "cloudflare",
	}),

	vite: {
		server: {
			host: true,
			port: 4325,
			allowedHosts: ["vitstore.dev"],
		},
		resolve: {
			alias: {
				react: "preact/compat",
				"react-dom": "preact/compat",
			},
		},
		plugins: [tailwindcss()],
	},

	integrations: [preact()],
});
