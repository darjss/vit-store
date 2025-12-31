import sitemap from "@astrojs/sitemap";
import solidJs from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";
import alchemy from "alchemy/cloudflare/astro";
import { defineConfig } from "astro/config";
import Icons from "unplugin-icons/vite";

// https://astro.build/config
export default defineConfig({
	site: "https://amerikvitamin.mn",
	output: "server",
	adapter: alchemy({
		imageService: "cloudflare",
	}),

	prefetch: {
		strategy: "tap",
	},
	vite: {
		plugins: [
			tailwindcss(),
			Icons({
				compiler: "solid",
				autoInstall: true,
			}),
		],

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

	integrations: [
		solidJs(),
		sitemap({
			filter: (page) =>
				!page.includes("/cart") &&
				!page.includes("/checkout") &&
				!page.includes("/login") &&
				!page.includes("/profile") &&
				!page.includes("/payment/") &&
				!page.includes("/order/"),
			changefreq: "weekly",
			priority: 0.7,
			lastmod: new Date(),
		}),
	],
});
