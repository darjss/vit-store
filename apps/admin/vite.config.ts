import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import { VitePWA } from "vite-plugin-pwa";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [
		tailwindcss(),
		tanstackRouter({}),
		react(),
		tsconfigPaths(),
		VitePWA({
			devOptions: { enabled: false },
			manifest: {
				description: "manage you vitamin ecommerce",
				name: "vit-admin",
				short_name: "vit-admin",
				theme_color: "#0c0c0c",
			},
			pwaAssets: { config: true, disabled: false },
			registerType: "autoUpdate",
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@server": path.resolve(__dirname, "../server/src"),
		},
		conditions: ["style", "default", "import", "module", "browser", "node"],
	},
	server: {
		allowedHosts: ["admin.vitstore.dev"],
		hmr: {
			clientPort: 443,
			host: "admin.vitstore.dev",
			protocol: "wss",
		},
		host: true,
		port: 3005,
	},
});
