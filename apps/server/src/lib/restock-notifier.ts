import { createDb } from "@vit/api/db";
import {
	ProductsTable,
	type RestockSubscriptionSelectType,
	RestockSubscriptionsTable,
} from "@vit/api/db/schema";
import { sendEmail, smsGateway } from "@vit/api/integrations";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { createLogger } from "evlog";

function createRestockLogger() {
	return createLogger({
		operation: "restock.notifier",
		request_id: crypto.randomUUID(),
		user_type: "system",
	});
}

function createDatabase(env: Env) {
	return createDb(env.DB);
}

async function pruneExpiredSubscriptions(db: ReturnType<typeof createDb>) {
	await db
		.delete(RestockSubscriptionsTable)
		.where(lte(RestockSubscriptionsTable.expiresAt, new Date()));
}

async function fetchWatchedProducts(db: ReturnType<typeof createDb>) {
	const rows = await db
		.selectDistinct({ productId: RestockSubscriptionsTable.productId })
		.from(RestockSubscriptionsTable)
		.where(gt(RestockSubscriptionsTable.expiresAt, new Date()));

	return rows.map((row) => row.productId);
}

async function fetchAvailableProduct(
	db: ReturnType<typeof createDb>,
	productId: number,
) {
	return db.query.ProductsTable.findFirst({
		columns: {
			id: true,
			name: true,
			stock: true,
			status: true,
		},
		where: and(
			eq(ProductsTable.id, productId),
			isNull(ProductsTable.deletedAt),
		),
	});
}

async function fetchSubscribers(
	db: ReturnType<typeof createDb>,
	productId: number,
): Promise<RestockSubscriptionSelectType[]> {
	return db.query.RestockSubscriptionsTable.findMany({
		where: and(
			eq(RestockSubscriptionsTable.productId, productId),
			gt(RestockSubscriptionsTable.expiresAt, new Date()),
		),
	});
}

async function notifySubscriber(
	productName: string,
	subscriber: RestockSubscriptionSelectType,
) {
	if (subscriber.channel === "sms") {
		const smsFinalState = await smsGateway.sendSmsAndWait({
			message: `${productName} бараа дахин орлоо. Та vitstore-д захиалах боломжтой.`,
			phoneNumbers: [`+976${subscriber.contact}`],
		});

		if (smsFinalState.state === "Failed") {
			throw new Error(smsFinalState.recipients[0]?.error ?? "SMS failed");
		}

		return;
	}

	await sendEmail({
		to: subscriber.contact,
		subject: `${productName} is back in stock`,
		text: `${productName} is back in stock at Vit Store. You can place your order now.`,
	});
}

async function removeSubscribersForProduct(
	db: ReturnType<typeof createDb>,
	productId: number,
) {
	await db
		.delete(RestockSubscriptionsTable)
		.where(eq(RestockSubscriptionsTable.productId, productId));
}

async function processSubscriber(
	db: ReturnType<typeof createDb>,
	productId: number,
	productName: string,
	subscriber: RestockSubscriptionSelectType,
) {
	try {
		await notifySubscriber(productName, subscriber);
		await db
			.delete(RestockSubscriptionsTable)
			.where(eq(RestockSubscriptionsTable.id, subscriber.id));
	} catch (error) {
		const log = createRestockLogger();
		log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "restock.notify_failed",
			product_id: productId,
			subscriber_id: subscriber.id,
		});
		log.emit();
	}
}

async function processWatchedProduct(
	db: ReturnType<typeof createDb>,
	productId: number,
) {
	const product = await fetchAvailableProduct(db, productId);
	if (!product) {
		await removeSubscribersForProduct(db, productId);
		return;
	}

	if (product.stock === 0 || product.status === "out_of_stock") {
		return;
	}

	const subscribers = await fetchSubscribers(db, productId);
	if (subscribers.length === 0) {
		return;
	}

	for (const subscriber of subscribers) {
		await processSubscriber(db, productId, product.name, subscriber);
	}
}

export async function runRestockNotifier(env: Env) {
	const db = createDatabase(env);
	await pruneExpiredSubscriptions(db);
	const watchedProducts = await fetchWatchedProducts(db);

	for (const productId of watchedProducts) {
		await processWatchedProduct(db, productId);
	}
}
