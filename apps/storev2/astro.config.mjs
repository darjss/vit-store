import solidJs from "@astrojs/solid-js";
import tailwindcss from "@tailwindcss/vite";
import alchemy from "alchemy/cloudflare/astro";
import { defineConfig } from "astro/config";

// https://astro.build/config
export default defineConfig({
	// output: "server",
	adapter: alchemy(),

	vite: {
		plugins: [tailwindcss()],
		resolve: {
			alias: {
				react: "preact/compat",
				"react-dom": "preact/compat",
			},
		},
		server: {
			allowedHosts: ["vitstore.dev"],
		},
	},

	integrations: [solidJs()],
});
