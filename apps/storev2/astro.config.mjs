import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import sitemap from "@astrojs/sitemap";
import solidJs from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import posthog from "@posthog/rollup-plugin";

// https://astro.build/config
const posthogSourceMapPlugin =
	process.env.POSTHOG_API_KEY &&
	process.env.POSTHOG_PROJECT_ID &&
	process.env.POSTHOG_SOURCEMAPS !== "false"
		? posthog({
				host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
				personalApiKey: process.env.POSTHOG_API_KEY,
				projectId: process.env.POSTHOG_PROJECT_ID,
				sourcemaps: {
					deleteAfterUpload: true,
					enabled: true,
					releaseName: "storev2",
					releaseVersion:
						process.env.CF_PAGES_COMMIT_SHA ?? process.env.COMMIT_SHA ?? process.env.GIT_SHA,
				},
			})
		: null;

const isDev = process.argv.includes("dev");

export default defineConfig({
	adapter: cloudflare({
		imageService: "cloudflare",
		...(isDev
			? {
					configPath: ".alchemy/local/wrangler.jsonc",
					persistState: { path: "../../.alchemy/miniflare/v3" },
				}
			: {}),
	}),
	cache: {
		provider: cacheCloudflare(),
	},
	integrations: [
		solidJs(),
		sitemap({
			changefreq: "weekly",
			filter: (page) =>
				!page.includes("/benchmark") &&
				!page.includes("/cart") &&
				!page.includes("/checkout") &&
				!page.includes("/login") &&
				!page.includes("/profile") &&
				!page.includes("/payment/") &&
				!page.includes("/order/") &&
				!page.includes("/privacy-policy") &&
				!page.includes("/returns-refunds") &&
				!page.includes("/terms-of-service") &&
				!page.includes("/test"),
			lastmod: new Date(),
			priority: 0.7,
		}),
	],
	output: "server",
	prefetch: {
		strategy: "hover",
	},

	site: "https://amerikvitamin.mn",
	trailingSlash: "ignore",

	vite: {
		build: {
			sourcemap: true,
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

		plugins: [tailwindcss(), posthogSourceMapPlugin].filter(Boolean),

		server: {
			allowedHosts: ["vitstore.dev"],
			host: true,
			port: 4321,
		},

		ssr: {
			noExternal: ["@solid-primitives/storage"],
		},
	},
});
