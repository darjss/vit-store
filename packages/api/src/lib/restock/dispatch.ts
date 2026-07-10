import { and, eq, gt, isNull, lt, lte, sql } from "drizzle-orm";
import type { RequestLogger } from "evlog";
import { createLogger } from "evlog";
import { db } from "~/db/client";
import { ProductsTable, RestockSubscriptionsTable } from "~/db/schema";
import { sendRestockNotification } from "~/lib/restock/send";

const MAX_OPEN_PRODUCTS_PER_CONTACT = 5;
const DELIVERY_BATCH_SIZE = 25;
const MAX_DELIVERY_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 10 * 60 * 1000;

export { DELIVERY_BATCH_SIZE, MAX_OPEN_PRODUCTS_PER_CONTACT };

function createRestockLogger() {
	return createLogger({
		operation: "restock.dispatch",
		request_id: crypto.randomUUID(),
		user_type: "system",
	});
}

export function shouldDispatchRestock(input: {
	previousStock: number;
	newStock: number;
}): boolean {
	return input.previousStock === 0 && input.newStock > 0;
}

function retryAt(attemptCount: number): Date {
	return new Date(
		Date.now() + Math.min(60, 5 * 2 ** Math.max(0, attemptCount - 1)) * 60_000,
	);
}

async function claimSubscription(subscriptionId: number) {
	const token = crypto.randomUUID();
	const now = new Date();
	const claimed = await db()
		.update(RestockSubscriptionsTable)
		.set({
			deliveryState: "sending",
			claimToken: token,
			leaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
			attemptCount: sql`${RestockSubscriptionsTable.attemptCount} + 1`,
		})
		.where(
			and(
				eq(RestockSubscriptionsTable.id, subscriptionId),
				isNull(RestockSubscriptionsTable.deletedAt),
				eq(RestockSubscriptionsTable.deliveryState, "pending"),
				lte(RestockSubscriptionsTable.nextAttemptAt, now),
			),
		)
		.returning({
			id: RestockSubscriptionsTable.id,
			channel: RestockSubscriptionsTable.channel,
			contact: RestockSubscriptionsTable.contact,
			deliveryKey: RestockSubscriptionsTable.deliveryKey,
			attemptCount: RestockSubscriptionsTable.attemptCount,
		});
	return claimed[0] ? { ...claimed[0], claimToken: token } : null;
}

async function finishClaim(input: {
	id: number;
	claimToken: string;
	state: "sent" | "failed" | "unknown";
	error?: string;
}) {
	await db()
		.update(RestockSubscriptionsTable)
		.set({
			deliveryState: input.state,
			claimToken: null,
			leaseExpiresAt: null,
			terminalAt: new Date(),
			lastError: input.error?.slice(0, 500) ?? null,
			contact: null,
		})
		.where(
			and(
				eq(RestockSubscriptionsTable.id, input.id),
				eq(RestockSubscriptionsTable.deliveryState, "sending"),
				eq(RestockSubscriptionsTable.claimToken, input.claimToken),
			),
		);
}

async function retryClaim(input: {
	id: number;
	claimToken: string;
	attemptCount: number;
	error: string;
}) {
	if (input.attemptCount >= MAX_DELIVERY_ATTEMPTS) {
		return finishClaim({ ...input, state: "failed" });
	}
	await db()
		.update(RestockSubscriptionsTable)
		.set({
			deliveryState: "pending",
			claimToken: null,
			leaseExpiresAt: null,
			nextAttemptAt: retryAt(input.attemptCount),
			lastError: input.error.slice(0, 500),
		})
		.where(
			and(
				eq(RestockSubscriptionsTable.id, input.id),
				eq(RestockSubscriptionsTable.deliveryState, "sending"),
				eq(RestockSubscriptionsTable.claimToken, input.claimToken),
			),
		);
}

async function reclaimExpiredClaims() {
	return db()
		.update(RestockSubscriptionsTable)
		.set({
			deliveryState: "pending",
			claimToken: null,
			leaseExpiresAt: null,
			nextAttemptAt: new Date(),
			lastError: "delivery lease expired before completion",
		})
		.where(
			and(
				eq(RestockSubscriptionsTable.deliveryState, "sending"),
				lt(RestockSubscriptionsTable.leaseExpiresAt, new Date()),
				isNull(RestockSubscriptionsTable.deletedAt),
			),
		)
		.returning({ id: RestockSubscriptionsTable.id });
}

export async function notifyRestockSubscribers(
	productId: number,
	limit = DELIVERY_BATCH_SIZE,
) {
	const log = createRestockLogger();
	const product = await db().query.ProductsTable.findFirst({
		columns: { id: true, name: true, slug: true, stock: true, status: true },
		where: and(
			eq(ProductsTable.id, productId),
			isNull(ProductsTable.deletedAt),
		),
	});
	if (!product || product.status !== "active" || product.stock <= 0)
		return { notified: 0, failed: 0, claimed: 0 };

	const candidates = await db()
		.select({ id: RestockSubscriptionsTable.id })
		.from(RestockSubscriptionsTable)
		.where(
			and(
				eq(RestockSubscriptionsTable.productId, productId),
				eq(RestockSubscriptionsTable.deliveryState, "pending"),
				isNull(RestockSubscriptionsTable.deletedAt),
				lte(RestockSubscriptionsTable.nextAttemptAt, new Date()),
			),
		)
		.orderBy(RestockSubscriptionsTable.id)
		.limit(limit);
	let notified = 0;
	let failed = 0;
	let claimedCount = 0;
	for (const candidate of candidates) {
		const result = await deliverCandidate(candidate.id, product, log);
		claimedCount += result.claimed;
		notified += result.notified;
		failed += result.failed;
	}
	log.info("restock.dispatch_complete", {
		product_id: productId,
		notified,
		failed,
		claimed: claimedCount,
		batch_limit: limit,
	});
	log.emit();
	return { notified, failed, claimed: claimedCount };
}

async function deliverCandidate(
	subscriptionId: number,
	product: { id: number; name: string; slug: string },
	log: RequestLogger<Record<string, unknown>>,
) {
	const claimed = await claimSubscription(subscriptionId);
	if (!claimed || !claimed.contact)
		return { claimed: 0, notified: 0, failed: 0 };
	try {
		await sendRestockNotification({
			channel: claimed.channel,
			contact: claimed.contact,
			productName: product.name,
			productSlug: product.slug,
			productId: product.id,
			deliveryKey: claimed.deliveryKey,
		});
		await finishClaim({
			id: claimed.id,
			claimToken: claimed.claimToken,
			state: "sent",
		});
		return { claimed: 1, notified: 1, failed: 0 };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (claimed.channel === "sms")
			await finishClaim({
				id: claimed.id,
				claimToken: claimed.claimToken,
				state: "unknown",
				error: message,
			});
		else
			await retryClaim({
				id: claimed.id,
				claimToken: claimed.claimToken,
				attemptCount: claimed.attemptCount,
				error: message,
			});
		log.error(error instanceof Error ? error : new Error(message), {
			event: "restock.notify_failed",
			product_id: product.id,
			subscription_id: claimed.id,
			channel: claimed.channel,
		});
		return { claimed: 1, notified: 0, failed: 1 };
	}
}

export async function dispatchRestockIfCrossedZero(input: {
	productId: number;
	previousStock: number;
	newStock: number;
}) {
	if (!shouldDispatchRestock(input))
		return { notified: 0, failed: 0, claimed: 0, skipped: true as const };
	return {
		...(await notifyRestockSubscribers(input.productId)),
		skipped: false as const,
	};
}

type WaitUntilContext = {
	c: { executionCtx: ExecutionContext };
	log: RequestLogger<Record<string, unknown>>;
};
export function scheduleRestockDispatch(
	ctx: WaitUntilContext,
	input: { productId: number; previousStock: number; newStock: number },
): void {
	if (!shouldDispatchRestock(input)) return;
	ctx.c.executionCtx.waitUntil(
		notifyRestockSubscribers(input.productId).catch((error) =>
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "restock.dispatch_failed",
				product_id: input.productId,
			}),
		),
	);
}
export function scheduleRestockDispatches(
	ctx: WaitUntilContext,
	candidates: Array<{
		productId: number;
		previousStock: number;
		newStock: number;
	}>,
): void {
	for (const candidate of candidates) scheduleRestockDispatch(ctx, candidate);
}

export async function runRestockSafetyNet() {
	const reclaimed = await reclaimExpiredClaims();
	const openSubs = await db()
		.selectDistinct({ productId: RestockSubscriptionsTable.productId })
		.from(RestockSubscriptionsTable)
		.innerJoin(
			ProductsTable,
			eq(ProductsTable.id, RestockSubscriptionsTable.productId),
		)
		.where(
			and(
				eq(RestockSubscriptionsTable.deliveryState, "pending"),
				isNull(RestockSubscriptionsTable.deletedAt),
				isNull(ProductsTable.deletedAt),
				eq(ProductsTable.status, "active"),
				gt(ProductsTable.stock, 0),
				lte(RestockSubscriptionsTable.nextAttemptAt, new Date()),
			),
		)
		.orderBy(RestockSubscriptionsTable.productId)
		.limit(DELIVERY_BATCH_SIZE);
	let notified = 0;
	let failed = 0;
	for (const row of openSubs) {
		const result = await notifyRestockSubscribers(row.productId);
		notified += result.notified;
		failed += result.failed;
	}
	return {
		productsChecked: openSubs.length,
		reclaimed: reclaimed.length,
		notified,
		failed,
	};
}
