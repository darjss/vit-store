import Firecrawl from "@mendable/firecrawl-js";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: "../../.env" });

type ProductRow = {
	id: number;
	name: string;
	amount: string;
	potency: string;
	price: number;
	weightGrams: number;
	brandName: string;
};

type Sample = {
	productId: number;
	query: string;
	priceMnt: number;
	amazonPriceUsd: number;
	weightGrams: number;
	amazonUrl: string;
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function extractAmazonPriceUsd(html: string): number | null {
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

function percentile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	const pos = (sorted.length - 1) * q;
	const lower = Math.floor(pos);
	const upper = Math.ceil(pos);
	if (lower === upper) return sorted[lower] ?? 0;
	const lowerValue = sorted[lower] ?? 0;
	const upperValue = sorted[upper] ?? lowerValue;
	return lowerValue + (upperValue - lowerValue) * (pos - lower);
}

function fitLinear(samples: Sample[]): { a: number; b: number } {
	const n = samples.length;
	if (n === 0) return { a: 0, b: 0 };

	const sumX = samples.reduce((acc, s) => acc + s.amazonPriceUsd, 0);
	const sumY = samples.reduce((acc, s) => acc + s.priceMnt, 0);
	const sumXY = samples.reduce(
		(acc, s) => acc + s.amazonPriceUsd * s.priceMnt,
		0,
	);
	const sumXX = samples.reduce(
		(acc, s) => acc + s.amazonPriceUsd * s.amazonPriceUsd,
		0,
	);

	const denominator = n * sumXX - sumX * sumX;
	if (denominator === 0) {
		return { a: 0, b: Math.round(sumY / n) };
	}

	const a = (n * sumXY - sumX * sumY) / denominator;
	const b = (sumY - a * sumX) / n;
	return { a, b };
}

function rmse(samples: Sample[], a: number, b: number): number {
	if (samples.length === 0) return 0;
	const mse =
		samples.reduce((acc, s) => {
			const predicted = a * s.amazonPriceUsd + b;
			const error = s.priceMnt - predicted;
			return acc + error * error;
		}, 0) / samples.length;
	return Math.sqrt(mse);
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
	if (xs.length !== ys.length || xs.length < 2) return 0;
	const n = xs.length;
	const meanX = xs.reduce((acc, x) => acc + x, 0) / n;
	const meanY = ys.reduce((acc, y) => acc + y, 0) / n;
	let num = 0;
	let denX = 0;
	let denY = 0;
	for (let i = 0; i < n; i++) {
		const dx = (xs[i] ?? 0) - meanX;
		const dy = (ys[i] ?? 0) - meanY;
		num += dx * dy;
		denX += dx * dx;
		denY += dy * dy;
	}
	if (denX <= 0 || denY <= 0) return 0;
	return num / Math.sqrt(denX * denY);
}

function fitWithWeight(samples: Sample[]): {
	aUsd: number;
	aWeight: number;
	c: number;
} {
	if (samples.length < 3) {
		return { aUsd: 0, aWeight: 0, c: 0 };
	}

	let sX1 = 0;
	let sX2 = 0;
	let sY = 0;
	let sX1X1 = 0;
	let sX2X2 = 0;
	let sX1X2 = 0;
	let sX1Y = 0;
	let sX2Y = 0;

	for (const s of samples) {
		const x1 = s.amazonPriceUsd;
		const x2 = s.weightGrams;
		const y = s.priceMnt;
		sX1 += x1;
		sX2 += x2;
		sY += y;
		sX1X1 += x1 * x1;
		sX2X2 += x2 * x2;
		sX1X2 += x1 * x2;
		sX1Y += x1 * y;
		sX2Y += x2 * y;
	}

	const n = samples.length;
	const a11 = sX1X1;
	const a12 = sX1X2;
	const a13 = sX1;
	const a21 = sX1X2;
	const a22 = sX2X2;
	const a23 = sX2;
	const a31 = sX1;
	const a32 = sX2;
	const a33 = n;

	const b1 = sX1Y;
	const b2 = sX2Y;
	const b3 = sY;

	const det =
		a11 * (a22 * a33 - a23 * a32) -
		a12 * (a21 * a33 - a23 * a31) +
		a13 * (a21 * a32 - a22 * a31);

	if (Math.abs(det) < 1e-9) {
		const linear = fitLinear(samples);
		return { aUsd: linear.a, aWeight: 0, c: linear.b };
	}

	const detUsd =
		b1 * (a22 * a33 - a23 * a32) -
		a12 * (b2 * a33 - a23 * b3) +
		a13 * (b2 * a32 - a22 * b3);
	const detWeight =
		a11 * (b2 * a33 - a23 * b3) -
		b1 * (a21 * a33 - a23 * a31) +
		a13 * (a21 * b3 - b2 * a31);
	const detC =
		a11 * (a22 * b3 - b2 * a32) -
		a12 * (a21 * b3 - b2 * a31) +
		b1 * (a21 * a32 - a22 * a31);

	return { aUsd: detUsd / det, aWeight: detWeight / det, c: detC / det };
}

function rmseWithWeight(
	samples: Sample[],
	aUsd: number,
	aWeight: number,
	c: number,
): number {
	if (samples.length === 0) return 0;
	const mse =
		samples.reduce((acc, s) => {
			const predicted = aUsd * s.amazonPriceUsd + aWeight * s.weightGrams + c;
			const err = s.priceMnt - predicted;
			return acc + err * err;
		}, 0) / samples.length;
	return Math.sqrt(mse);
}

function roundToNearest(value: number, step: number): number {
	return Math.round(value / step) * step;
}

async function main() {
	const sampleLimitArg = Number.parseInt(process.argv[2] || "35", 10);
	const sampleLimit = Number.isFinite(sampleLimitArg)
		? Math.max(10, Math.min(80, sampleLimitArg))
		: 35;

	const firecrawlApiKey = process.env.FIRECRAWL_API_KEY;
	if (!firecrawlApiKey) {
		throw new Error("FIRECRAWL_API_KEY is missing in .env");
	}

	const dbUrl =
		process.env.DIRECT_DB_URL ||
		(process.env.PLANETSCALE_USER &&
		process.env.PLANETSCALE_PASSWORD &&
		process.env.PLANETSCALE_HOST &&
		process.env.PLANETSCALE_DATABASE
			? `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`
			: undefined);
	if (!dbUrl) {
		throw new Error(
			"DIRECT_DB_URL or PLANETSCALE_* variables are missing in .env",
		);
	}

	const sql = postgres(dbUrl, { ssl: "require", max: 1 });
	const firecrawl = new Firecrawl({ apiKey: firecrawlApiKey });

	const products = await sql<ProductRow[]>`
		select
			p.id,
			p.name,
			p.amount,
			p.potency,
			p.price,
			p.weight_grams as "weightGrams",
			coalesce(b.name, '') as "brandName"
		from ecom_vit_product p
		left join ecom_vit_brand b on b.id = p.brand_id
		where p.deleted_at is null
			and p.price >= 20000
			and p.status in ('active', 'draft')
		order by p.updated_at desc nulls last, p.created_at desc
		limit ${sampleLimit * 4}
	`;

	console.log(`Loaded ${products.length} products from DB`);

	const results: Sample[] = [];
	const failures: string[] = [];

	for (const product of products) {
		if (results.length >= sampleLimit) break;

		const terms = [
			product.brandName,
			product.name,
			product.potency,
			product.amount,
		]
			.map((part) => part.trim())
			.filter((part) => part.length > 0);

		const query = terms.join(" ");
		if (!query) continue;

		try {
			const searchResponse = await firecrawl.search(
				`site:amazon.com ${query}`,
				{
					limit: 3,
				},
			);

			const candidateUrl =
				searchResponse.web
					?.map((x) => ("url" in x ? x.url : undefined))
					.find(
						(url) =>
							!!url &&
							/amazon\.com\/(?:[^\s]+\/)?(?:dp|gp\/product)\//i.test(url),
					) ?? null;

			if (!candidateUrl) {
				failures.push(`${product.id}: no_amazon_result`);
				continue;
			}

			const scrape = await firecrawl.scrape(candidateUrl, {
				formats: ["html"],
			});

			const html = scrape.html || "";
			const priceUsd = extractAmazonPriceUsd(html);

			if (!priceUsd) {
				failures.push(`${product.id}: no_price`);
				continue;
			}

			const normalizedName = product.name.toLowerCase();
			const htmlTitleMatch = html.match(/<title>([\s\S]{0,200})<\/title>/i);
			const htmlTitle = (htmlTitleMatch?.[1] || "").toLowerCase();
			const firstWord = normalizedName.split(/\s+/)[0] || "";
			if (
				firstWord.length >= 4 &&
				!new RegExp(escapeRegExp(firstWord), "i").test(htmlTitle)
			) {
				failures.push(`${product.id}: likely_mismatch`);
				continue;
			}

			results.push({
				productId: product.id,
				query,
				priceMnt: product.price,
				amazonPriceUsd: priceUsd,
				weightGrams: product.weightGrams,
				amazonUrl: candidateUrl,
			});

			console.log(
				`[${results.length}/${sampleLimit}] product=${product.id} usd=$${priceUsd.toFixed(2)} mnt=${product.price}`,
			);
		} catch (error) {
			failures.push(
				`${product.id}: ${(error as Error)?.message || "unknown_error"}`,
			);
		}
	}

	await sql.end({ timeout: 1 });

	if (results.length < 8) {
		console.log("Not enough matched samples to fit formula.");
		console.log(`Success=${results.length}, failures=${failures.length}`);
		return;
	}

	const multipliers = results
		.map((s) => s.priceMnt / s.amazonPriceUsd)
		.sort((a, b) => a - b);
	const q1 = percentile(multipliers, 0.25);
	const q3 = percentile(multipliers, 0.75);
	const iqr = q3 - q1;
	const low = q1 - 1.5 * iqr;
	const high = q3 + 1.5 * iqr;

	const inliers = results.filter((s) => {
		const m = s.priceMnt / s.amazonPriceUsd;
		return m >= low && m <= high;
	});

	const fitAll = fitLinear(results);
	const fitInliers = fitLinear(inliers);
	const fitAllWithWeight = fitWithWeight(results);
	const fitInliersWithWeight = fitWithWeight(inliers);

	const corrWeightToPrice = pearsonCorrelation(
		results.map((s) => s.weightGrams),
		results.map((s) => s.priceMnt),
	);
	const corrWeightToRatio = pearsonCorrelation(
		results.map((s) => s.weightGrams),
		results.map((s) => s.priceMnt / s.amazonPriceUsd),
	);

	console.log("\n=== Pricing Formula Discovery ===");
	console.log(`Samples: ${results.length} (inliers: ${inliers.length})`);
	console.log(
		`All samples fit: price_mnt = ${fitAll.a.toFixed(0)} * usd + ${fitAll.b.toFixed(0)} (rmse=${rmse(results, fitAll.a, fitAll.b).toFixed(0)})`,
	);
	console.log(
		`Inlier fit:      price_mnt = ${fitInliers.a.toFixed(0)} * usd + ${fitInliers.b.toFixed(0)} (rmse=${rmse(inliers, fitInliers.a, fitInliers.b).toFixed(0)})`,
	);
	console.log(
		`All + weight:    price_mnt = ${fitAllWithWeight.aUsd.toFixed(0)} * usd + ${fitAllWithWeight.aWeight.toFixed(1)} * g + ${fitAllWithWeight.c.toFixed(0)} (rmse=${rmseWithWeight(results, fitAllWithWeight.aUsd, fitAllWithWeight.aWeight, fitAllWithWeight.c).toFixed(0)})`,
	);
	console.log(
		`Inlier + weight: price_mnt = ${fitInliersWithWeight.aUsd.toFixed(0)} * usd + ${fitInliersWithWeight.aWeight.toFixed(1)} * g + ${fitInliersWithWeight.c.toFixed(0)} (rmse=${rmseWithWeight(inliers, fitInliersWithWeight.aUsd, fitInliersWithWeight.aWeight, fitInliersWithWeight.c).toFixed(0)})`,
	);
	console.log(
		`Weight correlation: corr(weight, price)=${corrWeightToPrice.toFixed(3)}, corr(weight, mnt/usd)=${corrWeightToRatio.toFixed(3)}`,
	);

	const medianMultiplier = percentile(multipliers, 0.5);
	const p75Multiplier = percentile(multipliers, 0.75);
	console.log(
		`Multiplier stats: median=${medianMultiplier.toFixed(0)}, p75=${p75Multiplier.toFixed(0)}`,
	);

	const exampleUsd = [10, 20, 30, 40, 60, 80];
	console.log(
		"\nSuggested rounded prices (nearest 1,000 MNT) using inlier fit:",
	);
	for (const usd of exampleUsd) {
		const raw = fitInliers.a * usd + fitInliers.b;
		console.log(
			`$${usd.toFixed(2)} -> ${roundToNearest(raw, 1000).toLocaleString("en-US")} MNT`,
		);
	}

	console.log("\nTop matched samples:");
	for (const sample of results.slice(0, 12)) {
		console.log(
			`product=${sample.productId} usd=$${sample.amazonPriceUsd.toFixed(2)} mnt=${sample.priceMnt} weight=${sample.weightGrams}g ratio=${(sample.priceMnt / sample.amazonPriceUsd).toFixed(0)} url=${sample.amazonUrl}`,
		);
	}

	if (failures.length > 0) {
		console.log("\nFailures (first 20):");
		for (const entry of failures.slice(0, 20)) {
			console.log(entry);
		}
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
