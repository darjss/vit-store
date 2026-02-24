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
	brandName: string;
};

type Sample = {
	productId: number;
	query: string;
	priceMnt: number;
	amazonPriceUsd: number;
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
	const patterns = [
		/"priceToPay"\s*:\s*\{[\s\S]*?"amount"\s*:\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/"apex_desktop"\s*:\s*\{[\s\S]*?"amount"\s*:\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
		/<span[^>]*class="a-price-whole"[^>]*>\s*([0-9,]+)\s*<\/span>[\s\S]{0,120}?<span[^>]*class="a-price-fraction"[^>]*>\s*([0-9]{2})\s*<\/span>/i,
		/\$\s*([0-9]+(?:\.[0-9]{2})?)/,
	];

	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (!match) continue;

		if (match.length >= 3 && pattern.source.includes("a-price-whole")) {
			const whole = match[1]?.replace(/,/g, "");
			const fraction = match[2];
			const combined = `${whole}.${fraction}`;
			const parsed = parsePriceTokenToUsd(combined);
			if (parsed) return parsed;
			continue;
		}

		const parsed = parsePriceTokenToUsd(match[1] ?? "");
		if (parsed) return parsed;
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

	console.log("\n=== Pricing Formula Discovery ===");
	console.log(`Samples: ${results.length} (inliers: ${inliers.length})`);
	console.log(
		`All samples fit: price_mnt = ${fitAll.a.toFixed(0)} * usd + ${fitAll.b.toFixed(0)} (rmse=${rmse(results, fitAll.a, fitAll.b).toFixed(0)})`,
	);
	console.log(
		`Inlier fit:      price_mnt = ${fitInliers.a.toFixed(0)} * usd + ${fitInliers.b.toFixed(0)} (rmse=${rmse(inliers, fitInliers.a, fitInliers.b).toFixed(0)})`,
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
			`product=${sample.productId} usd=$${sample.amazonPriceUsd.toFixed(2)} mnt=${sample.priceMnt} ratio=${(sample.priceMnt / sample.amazonPriceUsd).toFixed(0)} url=${sample.amazonUrl}`,
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
