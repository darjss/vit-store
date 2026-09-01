import { defineConfig } from "vite-plus/pack";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  noExternal: [/@vit\/.*/],
  sourcemap: true,
});
