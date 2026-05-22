export function extractProductImageIds(html: string): string[] {
	const imageIds = new Set<string>();

	const colorImagesMatch = html.match(
		/'colorImages'\s*:\s*\{\s*'initial'\s*:\s*(\[[\s\S]*?\])\s*\}/,
	);
	if (colorImagesMatch) {
		try {
			const imagesData = JSON.parse(colorImagesMatch[1]) as Array<{
				hiRes?: string;
				large?: string;
				main?: Record<string, string>;
			}>;
			for (const img of imagesData) {
				const url = img.hiRes || img.large || Object.values(img.main || {})[0];
				if (url) {
					const idMatch = url.match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
					if (idMatch) imageIds.add(idMatch[1]);
				}
			}
		} catch {
			// continue
		}
	}

	const hiResMatches = html.matchAll(/data-old-hires="([^"]+)"/g);
	for (const match of hiResMatches) {
		const idMatch = match[1].match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
		if (idMatch) imageIds.add(idMatch[1]);
	}

	const mainImageMatches = html.matchAll(
		/id="(?:imgTagWrapperId|main-image-container|landingImage)"[^>]*>[\s\S]*?src="([^"]+)"/g,
	);
	for (const match of mainImageMatches) {
		const idMatch = match[1].match(/\/images\/I\/([A-Za-z0-9\-_+%]+)\./);
		if (idMatch) imageIds.add(idMatch[1]);
	}

	const altImagesSection = html.match(
		/id="altImages"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
	);
	if (altImagesSection) {
		const thumbMatches = altImagesSection[0].matchAll(
			/\/images\/I\/([A-Za-z0-9\-_+%]+)\._[^"]+"/g,
		);
		for (const match of thumbMatches) {
			imageIds.add(match[1]);
		}
	}

	const productImageMatches = html.matchAll(
		/\/images\/I\/([789][0-9][A-Za-z0-9\-_+%]{5,})\._[^"]*"/g,
	);
	for (const match of productImageMatches) {
		imageIds.add(match[1]);
	}

	return Array.from(imageIds).slice(0, 10);
}

export function normalizedImageKey(url: string): string {
	try {
		const u = new URL(url);
		return `${u.origin}${u.pathname}`.toLowerCase().replace(/\/$/, "");
	} catch {
		return url.toLowerCase().split("?")[0] || url.toLowerCase();
	}
}

export function isLikelyJunkImage(url: string): boolean {
	const u = url.toLowerCase();
	if (u.includes("thumbnail")) return true;
	if (u.includes("sprite") || u.includes("icon") || u.includes("favicon")) {
		return true;
	}
	if (
		u.includes("hero") ||
		u.includes("banner") ||
		u.includes("carousel-placeholder")
	) {
		return true;
	}
	if (u.includes("/brands/")) return true;
	return false;
}

export function uniqueStable<T>(arr: T[], keyFn: (x: T) => string): T[] {
	const seen = new Set<string>();
	const out: T[] = [];
	for (const item of arr) {
		const key = keyFn(item);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(item);
	}
	return out;
}

function parsePriceTokenToUsd(token: string): number | null {
	const cleaned = token.replace(/,/g, "").trim();
	if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) {
		return null;
	}
	const value = Number.parseFloat(cleaned);
	if (!Number.isFinite(value) || value <= 0 || value > 1000) {
		return null;
	}
	return value;
}

export function extractAmazonPriceUsd(html: string): number | null {
	const candidates: number[] = [];
	const preferredPatterns = [
		/apex-pricetopay-value[\s\S]{0,300}?class=['"]a-offscreen['"][^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/apex-pricetopay-accessibility-label[^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/data-pricetopay-label[^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/['"]priceToPay['"]\s*:\s*\{[\s\S]*?['"]amount['"]\s*:\s*['"]?([0-9]+(?:\.[0-9]{1,2})?)['"]?/i,
		/['"]apex_desktop['"]\s*:\s*\{[\s\S]*?['"]amount['"]\s*:\s*['"]?([0-9]+(?:\.[0-9]{1,2})?)['"]?/i,
		/<span[^>]*class="a-price-whole"[^>]*>\s*([0-9,]+)\s*<\/span>[\s\S]{0,120}?<span[^>]*class="a-price-fraction"[^>]*>\s*([0-9]{2})\s*<\/span>/i,
	];

	for (const pattern of preferredPatterns) {
		const match = html.match(pattern);
		if (!match) continue;

		if (match.length >= 3 && pattern.source.includes("a-price-whole")) {
			const parsed = parsePriceTokenToUsd(
				`${(match[1] || "").replace(/,/g, "")}.${match[2] || "00"}`,
			);
			if (parsed) candidates.push(parsed);
			continue;
		}

		const parsed = parsePriceTokenToUsd(match[1] ?? "");
		if (parsed) candidates.push(parsed);
	}

	const preferredCandidates = candidates.filter((v) => v >= 5 && v <= 300);
	if (preferredCandidates.length > 0) {
		return Math.min(...preferredCandidates);
	}

	const fallbackCandidates = Array.from(
		html.matchAll(
			/class=['"]a-offscreen['"][^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{2})?)/g,
		),
	)
		.map((match) => parsePriceTokenToUsd(match[1] ?? ""))
		.filter((v): v is number => v != null && v >= 5 && v <= 300)
		.slice(0, 10);

	if (fallbackCandidates.length > 0) {
		return Math.min(...fallbackCandidates);
	}

	return null;
}
