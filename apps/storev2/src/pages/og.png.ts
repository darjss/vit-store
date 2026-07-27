import { renderHomeOgSvg } from "@/lib/og-image";
import { loadOgFonts, svgToPngResponse } from "@/lib/og-response";

export const prerender = false;

export async function GET({ request }: { request: Request }) {
	const fonts = await loadOgFonts(request.url);
	const svg = await renderHomeOgSvg(fonts);
	return svgToPngResponse(svg, request.url);
}
