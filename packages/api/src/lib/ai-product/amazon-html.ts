const AMAZON_IMAGE_ID = /\/images\/I\/([A-Za-z0-9\-_+%]+)\./;

function imageIdFromUrl(url: string): string | null {
	return url.match(AMAZON_IMAGE_ID)?.[1] ?? null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bracket matching must track strings, escapes, and nesting together.
function extractJsonArrayAt(source: string, start: number): string | null {
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = start; i < source.length; i += 1) {
		const char = source[i];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (char === "\\") {
				escaped = true;
			} else if (char === '"') {
				inString = false;
			}
			continue;
		}
		if (char === '"') {
			inString = true;
		} else if (char === "[") {
			depth += 1;
		} else if (char === "]") {
			depth -= 1;
			if (depth === 0) {
				return source.slice(start, i + 1);
			}
		}
	}

	return null;
}

function extractGalleryImageIds(html: string): Array<string> {
	const marker = /["']colorImages["']\s*:\s*\{\s*["']initial["']\s*:/g;
	const match = marker.exec(html);
	if (!match) {
		return [];
	}

	const arrayStart = html.indexOf("[", match.index + match[0].length);
	if (arrayStart === -1) {
		return [];
	}
	const raw = extractJsonArrayAt(html, arrayStart);
	if (!raw) {
		return [];
	}

	try {
		const images = JSON.parse(raw) as Array<{
			hiRes?: string;
			large?: string;
			main?: Record<string, [number, number]>;
		}>;
		return images.flatMap((image) => {
			const url = image.hiRes ?? image.large ?? Object.keys(image.main ?? {})[0];
			const id = url ? imageIdFromUrl(url) : null;
			return id ? [id] : [];
		});
	} catch {
		return [];
	}
}

function extractLandingImageId(html: string): string | null {
	for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
		const tag = match[0];
		if (!/\bid=["']landingImage["']/i.test(tag)) {
			continue;
		}
		const url =
			tag.match(/\bdata-old-hires=["']([^"']+)["']/i)?.[1] ??
			tag.match(/\bsrc=["']([^"']+)["']/i)?.[1];
		return url ? imageIdFromUrl(url) : null;
	}
	return null;
}

export function extractProductImageIds(html: string): Array<string> {
	const galleryIds = uniqueStable(extractGalleryImageIds(html), (id) => id);
	if (galleryIds.length > 0) {
		return galleryIds.slice(0, 10);
	}

	const landingImageId = extractLandingImageId(html);
	return landingImageId ? [landingImageId] : [];
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
	if (u.includes("thumbnail")) {
		return true;
	}
	if (u.includes("sprite") || u.includes("icon") || u.includes("favicon")) {
		return true;
	}
	if (u.includes("hero") || u.includes("banner") || u.includes("carousel-placeholder")) {
		return true;
	}
	if (u.includes("/brands/")) {
		return true;
	}
	return false;
}

export function uniqueStable<T>(arr: Array<T>, keyFn: (x: T) => string): Array<T> {
	const seen = new Set<string>();
	const out: Array<T> = [];
	for (const item of arr) {
		const key = keyFn(item);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		out.push(item);
	}
	return out;
}

function parsePriceTokenToUsd(token: string): number | null {
	const cleaned = token.replaceAll(",", "").trim();
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
	const candidates: Array<number> = [];
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
		if (!match) {
			continue;
		}

		if (match.length >= 3 && pattern.source.includes("a-price-whole")) {
			const parsed = parsePriceTokenToUsd(
				`${(match[1] || "").replaceAll(",", "")}.${match[2] || "00"}`,
			);
			if (parsed) {
				candidates.push(parsed);
			}
			continue;
		}

		const parsed = parsePriceTokenToUsd(match[1] ?? "");
		if (parsed) {
			candidates.push(parsed);
		}
	}

	const preferredCandidates = candidates.filter((v) => v >= 5 && v <= 300);
	if (preferredCandidates.length > 0) {
		return Math.min(...preferredCandidates);
	}

	const fallbackCandidates = Array.from(
		html.matchAll(/class=['"]a-offscreen['"][^>]*>\s*\$\s*([0-9]+(?:\.[0-9]{2})?)/g),
	)
		.map((match) => parsePriceTokenToUsd(match[1] ?? ""))
		.filter((v): v is number => v != null && v >= 5 && v <= 300)
		.slice(0, 10);

	if (fallbackCandidates.length > 0) {
		return Math.min(...fallbackCandidates);
	}

	return null;
}
