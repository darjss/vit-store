import {
	defineConfig,
	minimal2023Preset as preset,
} from "@vite-pwa/assets-generator/config";

// Regenerate the committed icons in public/pwa with `bun run generate-pwa-assets`.
// The vite config keeps pwaAssets disabled and references the committed PNGs.
export default defineConfig({
	headLinkOptions: {
		preset: "2023",
	},
	preset,
	images: ["public/pwa/pwa-512x512.png"],
});
