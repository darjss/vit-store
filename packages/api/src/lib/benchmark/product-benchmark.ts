import { isNull } from "drizzle-orm";
import { db } from "~/db/client";
import { ProductImagesTable, ProductsTable } from "~/db/schema";
import { kv } from "~/lib/kv";
import { redis } from "~/lib/redis";

export async function runProductBenchmark() {
	const kvCacheKey = "benchmark:products:5";
	const redisCacheKey = "benchmark:products:5:redis";

	const dbStartTime = performance.now();
	const products = await db().query.ProductsTable.findMany({
		columns: {
			id: true,
			name: true,
			price: true,
			slug: true,
		},
		limit: 5,
		where: isNull(ProductsTable.deletedAt),
		with: {
			images: {
				columns: { url: true },
				where: isNull(ProductImagesTable.deletedAt),
			},
		},
	});
	const dbElapsed = performance.now() - dbStartTime;

	const product = products.map((p) => ({
		id: p.id,
		images: p.images.map((img) => ({ url: img.url })),
		name: p.name,
		price: p.price,
		slug: p.slug,
	}));

	const kvWriteStartTime = performance.now();
	await kv().put(kvCacheKey, JSON.stringify(product), {
		expirationTtl: 3600,
	});
	const kvWriteElapsed = performance.now() - kvWriteStartTime;

	const kvReadStartTime = performance.now();
	const kvCached = await kv().get(kvCacheKey);
	const kvReadElapsed = performance.now() - kvReadStartTime;

	const redisWriteStartTime = performance.now();
	await redis().set(redisCacheKey, JSON.stringify(product), { ex: 3600 });
	const redisWriteElapsed = performance.now() - redisWriteStartTime;

	const redisReadStartTime = performance.now();
	await redis().get(redisCacheKey);
	const redisReadElapsed = performance.now() - redisReadStartTime;

	const kvReadProduct = kvCached ? JSON.parse(kvCached) : null;

	return {
		dbElapsed,
		kvReadElapsed,
		kvWriteElapsed,
		product: kvReadProduct || product,
		redisReadElapsed,
		redisWriteElapsed,
	};
}
