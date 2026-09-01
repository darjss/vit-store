import { defineConfig } from "vite-plus/pack";

export default defineConfig({
	clean: true,
	entry: "./src/index.ts",
	format: "esm",
	noExternal: [/@vit\/.*/],
	outDir: "./dist",
	sourcemap: true,
});
