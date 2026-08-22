import { initWasm, Resvg } from "@resvg/resvg-wasm";
import type { OgFonts } from "./og-image";

const CACHE_CONTROL =
	"public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000";

let wasmReady: Promise<void> | undefined;
let fontsReady: Promise<OgFonts> | undefined;

const fetchAsset = async (requestUrl: string, path: string) => {
	const response = await fetch(new URL(path, requestUrl));
	if (!response.ok) {
		throw new Error(`Could not load OG asset: ${path}`);
	}
	return response.arrayBuffer();
};

export const loadOgFonts = (requestUrl: string) => {
	fontsReady ??= Promise.all([
		fetchAsset(requestUrl, "/og-assets/noto-sans-regular.ttf"),
		fetchAsset(requestUrl, "/og-assets/noto-sans-bold.ttf"),
		fetchAsset(requestUrl, "/og-assets/unbounded-semibold.ttf"),
		fetchAsset(requestUrl, "/og-assets/unbounded-bold.ttf"),
	]).then(([sansRegular, sansBold, unboundedSemibold, unboundedBold]) => ({
		sansRegular,
		sansBold,
		unboundedSemibold,
		unboundedBold,
	}));
	return fontsReady;
};

const ensureWasm = (requestUrl: string) => {
	wasmReady ??= initWasm(fetch(new URL("/og-assets/resvg.wasm", requestUrl)));
	return wasmReady;
};

export const svgToPngResponse = async (svg: string, requestUrl: string) => {
	await ensureWasm(requestUrl);
	const renderer = new Resvg(svg, {
		fitTo: { mode: "original" },
		background: "#fffdf5",
	});
	const rendered = renderer.render();
	const png = rendered.asPng();
	rendered.free();
	renderer.free();

	return new Response(Uint8Array.from(png).buffer, {
		headers: {
			"Content-Type": "image/png",
			"Cache-Control": CACHE_CONTROL,
		},
	});
};
