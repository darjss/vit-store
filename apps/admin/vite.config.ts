import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	plugins: [
		tailwindcss(),
		tanstackRouter({}),
		react(),
		tsconfigPaths(),
	],
	resolve: {
		conditions: ['style', 'default', 'import', 'module', 'browser', 'node'],
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
