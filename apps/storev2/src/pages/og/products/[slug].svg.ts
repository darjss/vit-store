import { toProductImageUrl } from "@/lib/image";
import { api, createServerClient } from "@/lib/trpc";
import { env } from "cloudflare:workers";

export const prerender = false;

const SITE_URL = "https://amerikvitamin.mn";
const WIDTH = 1200;
const HEIGHT = 630;
const PRODUCT_IMAGE_WIDTH = 380;
const PRODUCT_IMAGE_HEIGHT = 460;

type ProductForOg = {
	name: string;
	brand?: { name?: string | null } | null;
	category?: { name?: string | null } | null;
	price: number;
	images: Array<{ url: string; isPrimary: boolean }>;
};

function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function stripHtml(value: string | null | undefined): string {
	if (!value) return "";
	return value
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function truncate(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function splitTitle(
	title: string,
	maxLineLength: number,
	maxLines: number,
): string[] {
	const words = title.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return ["Америк Витамин"];

	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		const candidate = currentLine ? `${currentLine} ${word}` : word;
		if (candidate.length <= maxLineLength) {
			currentLine = candidate;
			continue;
		}

		if (currentLine) {
			lines.push(currentLine);
			currentLine = word;
		} else {
			lines.push(truncate(word, maxLineLength));
			currentLine = "";
		}

		if (lines.length === maxLines) {
			return lines.map((line, index) =>
				index === maxLines - 1 ? truncate(`${line}…`, maxLineLength) : line,
			);
		}
	}

	if (currentLine && lines.length < maxLines) {
		lines.push(currentLine);
	}

	if (lines.length > maxLines) {
		return lines
			.slice(0, maxLines)
			.map((line, index) =>
				index === maxLines - 1 ? truncate(`${line}…`, maxLineLength) : line,
			);
	}

	if (lines.length === maxLines) {
		lines[maxLines - 1] = truncate(lines[maxLines - 1], maxLineLength);
	}

	return lines;
}

function formatPrice(price: number): string {
	return price > 0 ? `${new Intl.NumberFormat("en-US").format(price)} MNT` : "";
}

function getPrimaryImageUrl(
	images: Array<{ url: string; isPrimary: boolean }>,
): string | null {
	const primaryImage =
		images.find((image) => image.isPrimary)?.url ?? images[0]?.url;
	if (!primaryImage) return null;

	if (
		primaryImage.startsWith("http://") ||
		primaryImage.startsWith("https://")
	) {
		return toProductImageUrl(primaryImage, "md");
	}

	return toProductImageUrl(
		`${SITE_URL}${primaryImage.startsWith("/") ? primaryImage : `/${primaryImage}`}`,
		"md",
	);
}

function buildOgSvg(product: ProductForOg) {
	const productName = stripHtml(product.name);
	const brand = escapeXml(
		truncate(stripHtml(product.brand?.name) || "Америк Витамин", 22),
	);
	const category = escapeXml(
		truncate(stripHtml(product.category?.name) || "Бүтээгдэхүүн", 24),
	);
	const titleLines = splitTitle(productName, 18, 3);
	const longestLine = Math.max(...titleLines.map((line) => line.length));
	const titleFontSize =
		titleLines.length === 1
			? longestLine > 16
				? 72
				: 78
			: titleLines.length === 2
				? longestLine > 16
					? 62
					: 68
				: 56;
	const titleLineHeight = titleFontSize + 12;
	const titleStartY = 170;
	const priceTop = 360;
	const currentPrice = escapeXml(formatPrice(product.price));
	const productImageUrl = getPrimaryImageUrl(product.images);
	const productImage = productImageUrl
		? `<image href="${escapeXml(productImageUrl)}" x="${728 + Math.round((394 - PRODUCT_IMAGE_WIDTH) / 2)}" y="84" width="${PRODUCT_IMAGE_WIDTH}" height="${PRODUCT_IMAGE_HEIGHT}" preserveAspectRatio="xMidYMid meet" />`
		: "";

	return `
<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="86" y1="42" x2="1120" y2="630" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFDF5" />
      <stop offset="1" stop-color="#FFF7D1" />
    </linearGradient>
    <linearGradient id="panelGlow" x1="744" y1="72" x2="1080" y2="560" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFF8B0" />
      <stop offset="1" stop-color="#FFE47A" />
    </linearGradient>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="1.5" fill="#0F172A" fill-opacity="0.08" />
    </pattern>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)" />
  <circle cx="112" cy="100" r="150" fill="#FFF3A3" fill-opacity="0.72" />
  <circle cx="1132" cy="562" r="164" fill="#FFE16F" fill-opacity="0.52" />

  <rect x="26" y="26" width="1148" height="578" rx="30" fill="#FFFDF8" stroke="#111111" stroke-width="6" />
  <rect x="42" y="42" width="1116" height="546" rx="22" fill="none" stroke="#111111" stroke-opacity="0.22" stroke-width="2" />

  <rect x="80" y="76" width="228" height="44" rx="22" fill="#111111" />
  <text x="194" y="105" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#FFFDF8" text-anchor="middle">amerikvitamin.mn</text>

  <text x="84" y="146" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" letter-spacing="2" fill="#6B7280">PRODUCT PAGE</text>

  <text x="84" y="${titleStartY}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="${titleFontSize}" font-weight="900" fill="#111111">
    ${titleLines
			.map(
				(line, index) =>
					`<tspan x="84" y="${titleStartY + index * titleLineHeight}">${escapeXml(line)}</tspan>`,
			)
			.join("")}
  </text>

  <rect x="84" y="${priceTop}" width="288" height="108" rx="26" fill="#111111" />
  <text x="110" y="${priceTop + 44}" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#FFF7D6">Үнэ</text>
  <text x="110" y="${priceTop + 84}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-size="36" font-weight="900" fill="#FFFDF8">${currentPrice}</text>


  <rect x="84" y="488" width="182" height="44" rx="22" fill="#FFF4A8" stroke="#111111" stroke-width="3" />
  <text x="175" y="517" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#111111" text-anchor="middle">${brand}</text>

  <rect x="282" y="488" width="232" height="44" rx="22" fill="#FFFFFF" stroke="#111111" stroke-width="3" />
  <text x="398" y="517" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#111111" text-anchor="middle">${category}</text>

  <text x="84" y="566" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#111111">Америк Витамин</text>
  <text x="84" y="596" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600" fill="#4B5563">АНУ-ын витамин, нэмэлт тэжээл</text>

  <rect x="720" y="68" width="394" height="494" rx="44" fill="#FFFFFF" stroke="#111111" stroke-width="6" />
  <rect x="740" y="88" width="354" height="454" rx="34" fill="url(#panelGlow)" />
  <ellipse cx="917" cy="278" rx="150" ry="168" fill="#FFFDF8" fill-opacity="0.92" />
  <ellipse cx="917" cy="508" rx="116" ry="24" fill="#111111" fill-opacity="0.14" />
  ${productImage}

  <rect x="772" y="486" width="232" height="42" rx="21" fill="#111111" />
  <text x="888" y="514" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#FFFDF8" text-anchor="middle">100% жинхэнэ бүтээгдэхүүн</text>

  <path d="M693 112H640" stroke="#111111" stroke-width="6" stroke-linecap="round" />
  <path d="M690 560H628" stroke="#111111" stroke-width="6" stroke-linecap="round" />
  <path d="M1068 44V20" stroke="#111111" stroke-width="6" stroke-linecap="round" />
</svg>
`.trim();
}

export async function GET({
	params,
}: {
	params: { slug?: string };
}) {
	const slug = params.slug ?? "";
	const slugParts = slug.split("-");
	const productId = Number(slugParts[slugParts.length - 1]);

	if (Number.isNaN(productId)) {
		return new Response("Invalid product ID", { status: 400 });
	}

	const serverApi = env.server ? createServerClient(undefined, env.server) : api;
	const product = await serverApi.product.getProductById.query({ id: productId });
	if (!product) {
		return new Response("Product not found", { status: 404 });
	}

	return new Response(buildOgSvg(product), {
		headers: {
			"Content-Type": "image/svg+xml; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}
