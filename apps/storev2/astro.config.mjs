import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import sitemap from "@astrojs/sitemap";
import solidJs from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import posthog from "@posthog/rollup-plugin";
import Icons from "unplugin-icons/vite";

// https://astro.build/config
const posthogSourceMapPlugin = process.env.POSTHOG_API_KEY && process.env.POSTHOG_PROJECT_ID && process.env.POSTHOG_SOURCEMAPS !== "false"
	? posthog({
			personalApiKey: process.env.POSTHOG_API_KEY,
			projectId: process.env.POSTHOG_PROJECT_ID,
			host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
			sourcemaps: {
				enabled: true,
				releaseName: "storev2",
				releaseVersion: process.env.CF_PAGES_COMMIT_SHA ?? process.env.COMMIT_SHA ?? process.env.GIT_SHA,
				deleteAfterUpload: true,
			},
		})
	: null;

const isDev = process.argv.includes("dev");

export default defineConfig({
	site: "https://amerikvitamin.mn",
	trailingSlash: "ignore",
	output: "server",
	cache: {
		provider: cacheCloudflare(),
	},
	adapter: cloudflare({
		imageService: "cloudflare",
		...(isDev
			? {
					configPath: ".alchemy/local/wrangler.jsonc",
					persistState: { path: "../../.alchemy/miniflare/v3" },
				}
			: {}),
	}),

	prefetch: {
		strategy: "hover",
	},
	vite: {
		build: {
			sourcemap: true,
		},

		plugins: [
			tailwindcss(),
			Icons({
				compiler: "solid",
				autoInstall: true,
			}),
			posthogSourceMapPlugin,
		].filter(Boolean),

		server: {
			host: true,
			port: 4321,
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
				!page.includes("/benchmark") &&
				!page.includes("/cart") &&
				!page.includes("/checkout") &&
				!page.includes("/login") &&
				!page.includes("/profile") &&
				!page.includes("/payment/") &&
				!page.includes("/order/") &&
				!page.includes("/privacy-policy") &&
				!page.includes("/returns-refunds") &&
				!page.includes("/terms-of-service"),
			changefreq: "weekly",
			priority: 0.7,
			lastmod: new Date(),
		}),
	],
});
