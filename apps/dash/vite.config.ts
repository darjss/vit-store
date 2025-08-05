import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      customViteReactPlugin: true,
    }),
    viteReact(),
  ],

  server: {
    host: true,
    port: 3002,
    allowedHosts: ["admin.vitstore.dev"],
  },

  // Fix React duplication issues
  resolve: {
    dedupe: ["react", "react-dom"],
  },

  // Optimize dependencies to prevent duplication
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime"],
  },

  // SSR configuration to prevent React duplication
  ssr: {
    external: ["react", "react-dom"],
    noExternal: [
      // Bundle these for SSR
      "@tanstack/react-router",
      "@tanstack/react-start",
      "@tanstack/react-query",
    ],
  },
});
