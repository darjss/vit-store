import { and, eq, isNull, lt, lte, sql } from "drizzle-orm";
import type { RequestLogger } from "evlog";
import type { SummarizedLogObject } from "~/lib/logging";
import { createLogger } from "evlog";
import { db } from "~/db/client";
import { ProductsTable, RestockSubscriptionsTable } from "~/db/schema";
import { sendRestockNotification } from "~/lib/restock/send";

const MAX_OPEN_PRODUCTS_PER_CONTACT = 5;
const DELIVERY_BATCH_SIZE = 3;
const PROVIDER_TIMEOUT_MS = 8000;
const MAX_DELIVERY_ATTEMPTS = 5;
const CLAIM_LEASE_MS = 10 * 60 * 1000;

export { DELIVERY_BATCH_SIZE, MAX_OPEN_PRODUCTS_PER_CONTACT, PROVIDER_TIMEOUT_MS };

function createRestockLogger() {
	return createLogger({
		operation: "restock.dispatch",
		request_id: crypto.randomUUID(),
		user_type: "system",
	});
}

export function shouldDispatchRestock(input: { newStock: number; previousStock: number }): boolean {
	return input.previousStock === 0 && input.newStock > 0;
}

function retryAt(attemptCount: number): Date {
	return new Date(Date.now() + Math.min(60, 5 * 2 ** Math.max(0, attemptCount - 1)) * 60_000);
}

async function claimSubscription(subscriptionId: number) {
	const token = crypto.randomUUID();
	const now = new Date();
	const [claimed] = await db()
		.update(RestockSubscriptionsTable)
		.set({
			attemptCount: sql`${RestockSubscriptionsTable.attemptCount} + 1`,
			claimToken: token,
			deliveryState: "sending",
			leaseExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
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
			attemptCount: RestockSubscriptionsTable.attemptCount,
			channel: RestockSubscriptionsTable.channel,
			contact: RestockSubscriptionsTable.contact,
			id: RestockSubscriptionsTable.id,
		});
	return claimed ? { ...claimed, claimToken: token } : null;
}

async function finishClaim(input: {
	claimToken: string;
	error?: string;
	id: number;
	state: "sent" | "failed" | "unknown";
}) {
	await db()
		.update(RestockSubscriptionsTable)
		.set({
			claimToken: null,
			contact: null,
			deliveryState: input.state,
			lastError: input.error?.slice(0, 500) ?? null,
			leaseExpiresAt: null,
			terminalAt: new Date(),
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
	attemptCount: number;
	claimToken: string;
	error: string;
	id: number;
}) {
	if (input.attemptCount >= MAX_DELIVERY_ATTEMPTS) {
		return finishClaim({ ...input, state: "failed" });
	}
	await db()
		.update(RestockSubscriptionsTable)
		.set({
			claimToken: null,
			deliveryState: "pending",
			lastError: input.error.slice(0, 500),
			leaseExpiresAt: null,
			nextAttemptAt: retryAt(input.attemptCount),
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
	const ambiguousClaims = await db()
		.update(RestockSubscriptionsTable)
		.set({
			claimToken: null,
			contact: null,
			deliveryState: "unknown",
			lastError: "Lease expired after an ambiguous provider call",
			leaseExpiresAt: null,
			terminalAt: now,
		})
		.where(
			and(
				eq(RestockSubscriptionsTable.deliveryState, "sending"),
				lt(RestockSubscriptionsTable.leaseExpiresAt, now),
				isNull(RestockSubscriptionsTable.deletedAt),
			),
		)
		.returning({ id: RestockSubscriptionsTable.id });

	return { ambiguousClaims: ambiguousClaims.length };
}

class ProviderTimeoutError extends Error {
	constructor() {
		super("Restock provider timed out");
		this.name = "ProviderTimeoutError";
	}
}

function shouldRetryDelivery(input: {
	channel: "sms" | "email";
	providerResult: "failed" | "ambiguous";
}) {
	return input.channel === "email" && input.providerResult === "failed";
}

async function withProviderTimeout<T>(operation: Promise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		const timeout = setTimeout(() => {
			if (settled) {
				return;
			}
			settled = true;
			reject(new ProviderTimeoutError());
		}, PROVIDER_TIMEOUT_MS);

		operation.then(
			(value) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timeout);
				resolve(value);
			},
			(error) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timeout);
				reject(error);
			},
		);
	});
}

type DeliveryCandidate = {
	id: number;
	productId: number;
	productName: string;
	productSlug: string;
};

async function deliverCandidate(
	candidate: DeliveryCandidate,
	log: RequestLogger<SummarizedLogObject>,
) {
	const claimed = await claimSubscription(candidate.id);
	if (!claimed || !claimed.contact) {
		return { claimed: 0, failed: 0, notified: 0 };
	}
	try {
		await withProviderTimeout(
			sendRestockNotification({
				channel: claimed.channel,
				contact: claimed.contact,
				productId: candidate.productId,
				productName: candidate.productName,
				productSlug: candidate.productSlug,
			}),
		);
		await finishClaim({
			claimToken: claimed.claimToken,
			id: claimed.id,
			state: "sent",
		});
		return { claimed: 1, failed: 0, notified: 1 };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (
			shouldRetryDelivery({
				channel: claimed.channel,
				providerResult: error instanceof ProviderTimeoutError ? "ambiguous" : "failed",
			})
		) {
			await retryClaim({
				attemptCount: claimed.attemptCount,
				claimToken: claimed.claimToken,
				error: message,
				id: claimed.id,
			});
		} else {
			await finishClaim({
				claimToken: claimed.claimToken,
				error: message,
				id: claimed.id,
				state: "unknown",
			});
		}
		log.error(error instanceof Error ? error : new Error(message), {
			channel: claimed.channel,
			event: "restock.notify_failed",
			product_id: candidate.productId,
			subscription_id: claimed.id,
		});
		return { claimed: 1, failed: 1, notified: 0 };
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
		.innerJoin(ProductsTable, eq(ProductsTable.id, RestockSubscriptionsTable.productId))
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
		.orderBy(RestockSubscriptionsTable.nextAttemptAt, RestockSubscriptionsTable.id)
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
		batch_limit: DELIVERY_BATCH_SIZE,
		claimed,
		failed,
		notified,
	});
	log.emit();
	return { claimed, failed, notified };
}

export async function notifyRestockSubscribers(productId: number) {
	return runRestockDeliveryBatch(productId);
}

export async function dispatchRestockIfCrossedZero(input: {
	newStock: number;
	previousStock: number;
	productId: number;
}) {
	if (!shouldDispatchRestock(input)) {
		return { claimed: 0, failed: 0, notified: 0, skipped: true as const };
	}
	return {
		...(await runRestockDeliveryBatch(input.productId)),
		skipped: false as const,
	};
}

type WaitUntilContext = {
	c: { executionCtx: ExecutionContext };
	log: RequestLogger<SummarizedLogObject>;
};

export function scheduleRestockDispatch(
	ctx: WaitUntilContext,
	input: { newStock: number; previousStock: number; productId: number },
): void {
	if (!shouldDispatchRestock(input)) {
		return;
	}
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
		newStock: number;
		previousStock: number;
		productId: number;
	}>,
): void {
	if (!candidates.some(shouldDispatchRestock)) {
		return;
	}
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
