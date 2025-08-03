// @ts-check

import cloudflare from "@astrojs/cloudflare";
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
			port: 4321,
			allowedHosts: ["vitstore.dev"],
		},
	},
});
