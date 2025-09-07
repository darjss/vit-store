import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [
		tailwindcss(),
		tanstackRouter({}),
		react(),
		VitePWA({
			registerType: "autoUpdate",
			manifest: {
				name: "better-t-test",
				short_name: "better-t-test",
				description: "better-t-test - PWA Application",
				theme_color: "#0c0c0c",
			},
			pwaAssets: { disabled: false, config: true },
			devOptions: { enabled: true },
		}),
		cloudflare(),
		tsconfigPaths(),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@server": path.resolve(__dirname, "../server/src"),
		},
	},
	server: {
		host: true,
		port: 3000,
		allowedHosts: ["admin.vitstore.dev"],
	},
});
