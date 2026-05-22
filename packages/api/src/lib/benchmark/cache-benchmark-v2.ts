import { isNull } from "drizzle-orm";
import { db } from "~/db/client";
import { ProductImagesTable, ProductsTable } from "~/db/schema";
import { kv } from "~/lib/kv";
import { redis } from "~/lib/redis";
import { measureMs, summarizeTimings } from "~/lib/utils";

export async function runCacheBenchmarkV2(options?: {
	iterations?: number;
	warmup?: number;
}) {
	const iterations = options?.iterations ?? 12;
	const warmup = options?.warmup ?? 2;

	const sourceProducts = await db().query.ProductsTable.findMany({
		columns: {
			id: true,
			name: true,
			slug: true,
			price: true,
		},
		where: isNull(ProductsTable.deletedAt),
		limit: 5,
		with: {
			images: {
				columns: { url: true },
				where: isNull(ProductImagesTable.deletedAt),
			},
		},
	});

	const payload = JSON.stringify(
		sourceProducts.map((product) => ({
			id: product.id,
			name: product.name,
			slug: product.slug,
			price: product.price,
			images: product.images.map((image) => ({ url: image.url })),
		})),
	);

	const benchmarkId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	const kvReadKey = `benchmark:v2:${benchmarkId}:kv:read`;
	const redisReadKey = `benchmark:v2:${benchmarkId}:redis:read`;

	await kv().put(kvReadKey, payload, { expirationTtl: 3600 });
	await redis().set(redisReadKey, payload, { ex: 3600 });

	for (let i = 0; i < warmup; i++) {
		await kv().get(kvReadKey);
		await redis().get(redisReadKey);
	}

	const dbTimes: number[] = [];
	const kvReadHitTimes: number[] = [];
	const kvWriteTimes: number[] = [];
	const redisReadHitTimes: number[] = [];
	const redisWriteTimes: number[] = [];

	for (let i = 0; i < iterations; i++) {
		dbTimes.push(
			await measureMs(async () => {
				await db().query.ProductsTable.findMany({
					columns: { id: true },
					where: isNull(ProductsTable.deletedAt),
					limit: 5,
				});
			}),
		);

		kvReadHitTimes.push(
			await measureMs(async () => {
				await kv().get(kvReadKey);
			}),
		);

		kvWriteTimes.push(
			await measureMs(async () => {
				await kv().put(`benchmark:v2:${benchmarkId}:kv:write:${i}`, payload, {
					expirationTtl: 3600,
				});
			}),
		);

		redisReadHitTimes.push(
			await measureMs(async () => {
				await redis().get(redisReadKey);
			}),
		);

		redisWriteTimes.push(
			await measureMs(async () => {
				await redis().set(
					`benchmark:v2:${benchmarkId}:redis:write:${i}`,
					payload,
					{ ex: 3600 },
				);
			}),
		);
	}

	const kvCompositeMean =
		summarizeTimings(kvReadHitTimes).mean +
		summarizeTimings(kvWriteTimes).mean;
	const redisCompositeMean =
		summarizeTimings(redisReadHitTimes).mean +
		summarizeTimings(redisWriteTimes).mean;

	return {
		iterations,
		warmup,
		placementHint: "Compare p95 and tail behavior over mean only",
		db: summarizeTimings(dbTimes),
		kv: {
			readHit: summarizeTimings(kvReadHitTimes),
			write: summarizeTimings(kvWriteTimes),
			compositeMean: kvCompositeMean,
		},
		redis: {
			readHit: summarizeTimings(redisReadHitTimes),
			write: summarizeTimings(redisWriteTimes),
			compositeMean: redisCompositeMean,
		},
		recommendation: kvCompositeMean <= redisCompositeMean ? "kv" : "redis",
	};
}
