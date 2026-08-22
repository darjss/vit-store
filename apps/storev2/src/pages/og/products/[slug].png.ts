import { env } from "cloudflare:workers";
import { toProductImageUrl } from "@/lib/image";
import { renderProductOgSvg } from "@/lib/og-image";
import { loadOgFonts, svgToPngResponse } from "@/lib/og-response";
import { api, createServerClient } from "@/lib/trpc";

export const prerender = false;

const SITE_URL = "https://amerikvitamin.mn";

const getImageUrl = (images: Array<{ url: string; isPrimary: boolean }>) => {
	const image = images.find((item) => item.isPrimary)?.url ?? images[0]?.url;
	if (!image) return null;
	const absoluteUrl = image.startsWith("http")
		? image
		: `${SITE_URL}${image.startsWith("/") ? image : `/${image}`}`;
	return toProductImageUrl(absoluteUrl, "md").replace(
		"format=auto",
		"format=png",
	);
};

const fetchImageDataUrl = async (url: string | null) => {
	if (!url) return null;
	const response = await fetch(url);
	if (!response.ok) return null;
	const bytes = new Uint8Array(await response.arrayBuffer());
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 8192) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
	}
	const contentType = response.headers.get("content-type") || "image/webp";
	return `data:${contentType};base64,${btoa(binary)}`;
};

export async function GET({
	params,
	request,
}: {
	params: { slug?: string };
	request: Request;
}) {
	const slug = params.slug ?? "";
	const productId = Number(slug.split("-").at(-1));
	if (!Number.isFinite(productId)) {
		return new Response("Invalid product ID", { status: 400 });
	}

	const serverApi = env.server
		? createServerClient(undefined, env.server)
		: api;
	const product = await serverApi.product.getProductById.query({
		id: productId,
	});
	if (!product) {
		return new Response("Product not found", { status: 404 });
	}

	const [fonts, imageUrl] = await Promise.all([
		loadOgFonts(request.url),
		fetchImageDataUrl(getImageUrl(product.images)),
	]);
	const svg = await renderProductOgSvg(
		{
			name: product.name
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim(),
			price: product.price,
			brand: product.brand?.name,
			category: product.category?.name,
			imageUrl,
		},
		fonts,
	);
	return svgToPngResponse(svg, request.url);
}
