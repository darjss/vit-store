import { defineConfig } from "vite-plus";

export default defineConfig({
	pack: {
		clean: true,
		dts: false,
		entry: ["./src/index.ts", "./alchemy.run.ts"],
		format: "esm",
		noExternal: [/@vit\/.*/],
		outDir: "./lib",
		sourcemap: true,
	},
});
