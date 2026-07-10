import { and, eq, isNull, lt, lte, sql } from "drizzle-orm";
import type { RequestLogger } from "evlog";
import { createLogger } from "evlog";
import { db } from "~/db/client";
import { ProductsTable, RestockSubscriptionsTable } from "~/db/schema";
import { sendRestockNotification } from "~/lib/restock/send";

const MAX_OPEN_PRODUCTS_PER_CONTACT = 5;
const DELIVERY_BATCH_SIZE = 3;
const PROVIDER_TIMEOUT_MS = 8_000;
const MAX_DELIVERY_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 10 * 60 * 1000;

export {
	DELIVERY_BATCH_SIZE,
	MAX_OPEN_PRODUCTS_PER_CONTACT,
	PROVIDER_TIMEOUT_MS,
};

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
	const [claimed] = await db()
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
				eq(RestockSubscriptionsTable.consentState, "verified"),
				eq(RestockSubscriptionsTable.deliveryState, "pending"),
				isNull(RestockSubscriptionsTable.deletedAt),
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
	return claimed ? { ...claimed, claimToken: token } : null;
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

async function recoverExpiredClaims() {
	const now = new Date();
	const ambiguousSms = await db()
		.update(RestockSubscriptionsTable)
		.set({
			deliveryState: "unknown",
			claimToken: null,
			leaseExpiresAt: null,
			terminalAt: now,
			contact: null,
			lastError: "SMS lease expired after an ambiguous provider call",
		})
		.where(
			and(
				eq(RestockSubscriptionsTable.channel, "sms"),
				eq(RestockSubscriptionsTable.deliveryState, "sending"),
				lt(RestockSubscriptionsTable.leaseExpiresAt, now),
				isNull(RestockSubscriptionsTable.deletedAt),
			),
		)
		.returning({ id: RestockSubscriptionsTable.id });

	const retryableEmail = await db()
		.update(RestockSubscriptionsTable)
		.set({
			deliveryState: "pending",
			claimToken: null,
			leaseExpiresAt: null,
			nextAttemptAt: now,
			lastError: "Email lease expired before completion",
		})
		.where(
			and(
				eq(RestockSubscriptionsTable.channel, "email"),
				eq(RestockSubscriptionsTable.deliveryState, "sending"),
				lt(RestockSubscriptionsTable.leaseExpiresAt, now),
				isNull(RestockSubscriptionsTable.deletedAt),
			),
		)
		.returning({ id: RestockSubscriptionsTable.id });

	return {
		ambiguousSms: ambiguousSms.length,
		retryableEmail: retryableEmail.length,
	};
}

async function withProviderTimeout<T>(operation: Promise<T>): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			operation,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error("Restock provider timed out")),
					PROVIDER_TIMEOUT_MS,
				);
			}),
		]);
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

type DeliveryCandidate = {
	id: number;
	productId: number;
	productName: string;
	productSlug: string;
};

async function deliverCandidate(
	candidate: DeliveryCandidate,
	log: RequestLogger<Record<string, unknown>>,
) {
	const claimed = await claimSubscription(candidate.id);
	if (!claimed || !claimed.contact)
		return { claimed: 0, notified: 0, failed: 0 };
	try {
		await withProviderTimeout(
			sendRestockNotification({
				channel: claimed.channel,
				contact: claimed.contact,
				productName: candidate.productName,
				productSlug: candidate.productSlug,
				productId: candidate.productId,
				deliveryKey: claimed.deliveryKey,
			}),
		);
		await finishClaim({
			id: claimed.id,
			claimToken: claimed.claimToken,
			state: "sent",
		});
		return { claimed: 1, notified: 1, failed: 0 };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (claimed.channel === "sms") {
			await finishClaim({
				id: claimed.id,
				claimToken: claimed.claimToken,
				state: "unknown",
				error: message,
			});
		} else {
			await retryClaim({
				id: claimed.id,
				claimToken: claimed.claimToken,
				attemptCount: claimed.attemptCount,
				error: message,
			});
		}
		log.error(error instanceof Error ? error : new Error(message), {
			event: "restock.notify_failed",
			product_id: candidate.productId,
			subscription_id: claimed.id,
			channel: claimed.channel,
		});
		return { claimed: 1, notified: 0, failed: 1 };
	}
}

export async function runRestockDeliveryBatch(productId?: number) {
	const log = createRestockLogger();
	const candidates = await db()
		.select({
			id: RestockSubscriptionsTable.id,
			productId: ProductsTable.id,
			productName: ProductsTable.name,
			productSlug: ProductsTable.slug,
		})
		.from(RestockSubscriptionsTable)
		.innerJoin(
			ProductsTable,
			eq(ProductsTable.id, RestockSubscriptionsTable.productId),
		)
		.where(
			and(
				productId === undefined ? undefined : eq(ProductsTable.id, productId),
				eq(RestockSubscriptionsTable.consentState, "verified"),
				eq(RestockSubscriptionsTable.deliveryState, "pending"),
				isNull(RestockSubscriptionsTable.deletedAt),
				lte(RestockSubscriptionsTable.nextAttemptAt, new Date()),
				eq(ProductsTable.status, "active"),
				sql`${ProductsTable.stock} > 0`,
				isNull(ProductsTable.deletedAt),
			),
		)
		.orderBy(
			RestockSubscriptionsTable.nextAttemptAt,
			RestockSubscriptionsTable.id,
		)
		.limit(DELIVERY_BATCH_SIZE);

	let claimed = 0;
	let notified = 0;
	let failed = 0;
	for (const candidate of candidates) {
		const result = await deliverCandidate(candidate, log);
		claimed += result.claimed;
		notified += result.notified;
		failed += result.failed;
	}
	log.info("restock.dispatch_complete", {
		claimed,
		notified,
		failed,
		batch_limit: DELIVERY_BATCH_SIZE,
	});
	log.emit();
	return { claimed, notified, failed };
}

export async function notifyRestockSubscribers(productId: number) {
	return runRestockDeliveryBatch(productId);
}

export async function dispatchRestockIfCrossedZero(input: {
	productId: number;
	previousStock: number;
	newStock: number;
}) {
	if (!shouldDispatchRestock(input))
		return { claimed: 0, notified: 0, failed: 0, skipped: true as const };
	return {
		...(await runRestockDeliveryBatch(input.productId)),
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
		runRestockDeliveryBatch(input.productId).catch((error) =>
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
	if (!candidates.some(shouldDispatchRestock)) return;
	ctx.c.executionCtx.waitUntil(
		runRestockDeliveryBatch().catch((error) =>
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "restock.dispatch_failed",
				transition_count: candidates.length,
			}),
		),
	);
}

export async function runRestockSafetyNet() {
	const recovered = await recoverExpiredClaims();
	return { ...recovered, ...(await runRestockDeliveryBatch()) };
}
