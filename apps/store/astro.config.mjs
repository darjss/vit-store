// @ts-check
import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
    },

    imageService: "cloudflare",
  }),
  vite: {
    server: {
      host: true,
      port: 4321,
      allowedHosts: ["vitstore.dev"],
    },
  },
});
