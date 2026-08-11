import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import solid from "vite-plugin-solid";
import tsconfigPaths from "vite-tsconfig-paths";

// NOTE: this file is owned by Track 2 and mirrored in
// plans/admin-v2-patches/admin-v2-manifest.patch for the integrator.
export default defineConfig({
	plugins: [
		tailwindcss(),
		tanstackRouter({ target: "solid", autoCodeSplitting: false }),
		solid(),
		tsconfigPaths(),
		VitePWA({
			registerType: "autoUpdate",
			manifest: {
				name: "vit-admin",
				short_name: "vit-admin",
				description: "vit-store удирдлагын хэсэг",
				lang: "mn",
				display: "standalone",
				start_url: "/",
				theme_color: "#faf6ee",
				background_color: "#faf6ee",
				icons: [
					{
						src: "/pwa/pwa-192x192.png",
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: "/pwa/pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
					},
					{
						src: "/pwa/maskable-icon-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable",
					},
				],
			},
			pwaAssets: { disabled: true, config: false },
			devOptions: { enabled: false },
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@server": path.resolve(__dirname, "../server/src"),
		},
	},
	server: {
		host: true,
		port: 3006,
	},
});
