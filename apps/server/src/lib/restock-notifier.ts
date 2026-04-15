import { Redis } from "@upstash/redis";
import { createDb } from "@vit/api/db";
import { ProductsTable } from "@vit/api/db/schema";
import { sendEmail, smsGateway } from "@vit/api/integrations";
import { createLogger } from "@vit/logger";
import type { RestockSubscription } from "@vit/shared";
import { and, eq, isNull } from "drizzle-orm";

const RESTOCK_WATCH_PRODUCTS_KEY = "restock:watch:products";

type EnvWithDirectDbUrl = Env & { DIRECT_DB_URL?: string };

function createRedisClient(env: Env) {
	return new Redis({
		url: env.UPSTASH_REDIS_REST_URL,
		token: env.UPSTASH_REDIS_REST_TOKEN,
	});
}

function createRestockLogger() {
	return createLogger({
		requestId: crypto.randomUUID(),
		userType: "system",
	});
}

function createDatabase(env: Env) {
	const directDbUrl = (env as EnvWithDirectDbUrl).DIRECT_DB_URL;
	return directDbUrl && directDbUrl.length > 0
		? createDb(directDbUrl)
		: createDb(env.DB);
}

async function removeInvalidWatchedProduct(redis: Redis, productIdRaw: string) {
	await redis.srem(RESTOCK_WATCH_PRODUCTS_KEY, productIdRaw);
}

async function fetchWatchedProducts(redis: Redis) {
	return ((await redis.smembers(RESTOCK_WATCH_PRODUCTS_KEY)) as string[]) ?? [];
}

async function fetchSubscribers(redis: Redis, productId: number) {
	return ((await redis.smembers(`restock:subs:${productId}`)) as string[]) ?? [];
}

async function fetchAvailableProduct(env: Env, productId: number) {
	const db = createDatabase(env);
	return db.query.ProductsTable.findFirst({
		columns: {
			id: true,
			name: true,
			stock: true,
			status: true,
		},
		where: and(eq(ProductsTable.id, productId), isNull(ProductsTable.deletedAt)),
	});
}

async function cleanupSubscriber(redis: Redis, productId: number, subscriberId: string) {
	const subscriberDataKey = `restock:sub:${productId}:${subscriberId}`;
	const productSubscribersKey = `restock:subs:${productId}`;
	await redis.del(subscriberDataKey);
	await redis.srem(productSubscribersKey, subscriberId);
}

async function notifySubscriber(
	productName: string,
	payload: RestockSubscription,
) {
	if (payload.channel === "sms") {
		const smsFinalState = await smsGateway.sendSmsAndWait({
			message: `${productName} бараа дахин орлоо. Та vitstore-д захиалах боломжтой.`,
			phoneNumbers: [`+976${payload.contact}`],
		});

		if (smsFinalState.state === "Failed") {
			throw new Error(smsFinalState.recipients[0]?.error ?? "SMS failed");
		}

		return;
	}

	await sendEmail({
		to: payload.contact,
		subject: `${productName} is back in stock`,
		text: `${productName} is back in stock at Vit Store. You can place your order now.`,
	});
}

async function processSubscriber(
	redis: Redis,
	productId: number,
	productName: string,
	subscriberId: string,
) {
	const subscriberDataKey = `restock:sub:${productId}:${subscriberId}`;
	const payloadRaw = await redis.get<string>(subscriberDataKey);

	if (!payloadRaw) {
		await redis.srem(`restock:subs:${productId}`, subscriberId);
		return;
	}

	let payload: RestockSubscription;
	try {
		payload = JSON.parse(payloadRaw) as RestockSubscription;
	} catch {
		await cleanupSubscriber(redis, productId, subscriberId);
		return;
	}

	try {
		await notifySubscriber(productName, payload);
		await cleanupSubscriber(redis, productId, subscriberId);
	} catch (error) {
		createRestockLogger().error("restock.notify_failed", error, {
			productId,
			subscriberId,
			error,
		});
	}
}

async function processWatchedProduct(redis: Redis, env: Env, productIdRaw: string) {
	const productId = Number.parseInt(productIdRaw, 10);
	if (!Number.isFinite(productId) || productId <= 0) {
		await removeInvalidWatchedProduct(redis, productIdRaw);
		return;
	}

	const product = await fetchAvailableProduct(env, productId);
	if (!product) {
		await removeInvalidWatchedProduct(redis, String(productId));
		return;
	}

	if (product.stock === 0 || product.status === "out_of_stock") {
		return;
	}

	const subscriberIds = await fetchSubscribers(redis, productId);
	if (subscriberIds.length === 0) {
		await removeInvalidWatchedProduct(redis, String(productId));
		return;
	}

	for (const subscriberId of subscriberIds) {
		await processSubscriber(redis, productId, product.name, subscriberId);
	}

	const remainingSubscribers = await fetchSubscribers(redis, productId);
	if (remainingSubscribers.length > 0) {
		return;
	}

	await redis.del(`restock:subs:${productId}`);
	await removeInvalidWatchedProduct(redis, String(productId));
}

export async function runRestockNotifier(env: Env) {
	const redis = createRedisClient(env);
	const watchedProducts = await fetchWatchedProducts(redis);

	for (const productIdRaw of watchedProducts) {
		await processWatchedProduct(redis, env, productIdRaw);
	}
}
