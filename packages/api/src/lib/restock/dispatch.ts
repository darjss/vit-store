import { and, eq, gt, isNotNull, isNull, lt } from "drizzle-orm";
import type { RequestLogger } from "evlog";
import { createLogger } from "evlog";
import { db } from "~/db/client";
import { ProductsTable, RestockSubscriptionsTable } from "~/db/schema";
import { sendRestockNotification } from "~/lib/restock/send";

const MAX_OPEN_PRODUCTS_PER_CONTACT = 5;
const STALE_CLAIM_MS = 10 * 60 * 1000;

export { MAX_OPEN_PRODUCTS_PER_CONTACT };

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

async function claimSubscription(subscriptionId: number, claimedAt: Date) {
	const claimed = await db()
		.update(RestockSubscriptionsTable)
		.set({
			notifiedAt: claimedAt,
		})
		.where(
			and(
				eq(RestockSubscriptionsTable.id, subscriptionId),
				isNull(RestockSubscriptionsTable.deletedAt),
				isNull(RestockSubscriptionsTable.notifiedAt),
			),
		)
		.returning({
			id: RestockSubscriptionsTable.id,
			channel: RestockSubscriptionsTable.channel,
			contact: RestockSubscriptionsTable.contact,
		});

	return claimed[0] ?? null;
}

async function completeSubscription(subscriptionId: number, completedAt: Date) {
	await db()
		.update(RestockSubscriptionsTable)
		.set({
			deletedAt: completedAt,
		})
		.where(
			and(
				eq(RestockSubscriptionsTable.id, subscriptionId),
				isNull(RestockSubscriptionsTable.deletedAt),
			),
		);
}

async function reopenSubscription(subscriptionId: number) {
	try {
		await db()
			.update(RestockSubscriptionsTable)
			.set({
				notifiedAt: null,
			})
			.where(
				and(
					eq(RestockSubscriptionsTable.id, subscriptionId),
					isNull(RestockSubscriptionsTable.deletedAt),
					isNotNull(RestockSubscriptionsTable.notifiedAt),
				),
			);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const uniqueConflict =
			message.includes("restock_sub_open_unique_idx") ||
			message.includes("unique") ||
			message.includes("duplicate");
		if (!uniqueConflict) {
			throw error;
		}
		await db()
			.update(RestockSubscriptionsTable)
			.set({
				deletedAt: new Date(),
			})
			.where(
				and(
					eq(RestockSubscriptionsTable.id, subscriptionId),
					isNull(RestockSubscriptionsTable.deletedAt),
				),
			);
	}
}

export async function notifyRestockSubscribers(productId: number) {
	const log = createRestockLogger();
	const product = await db().query.ProductsTable.findFirst({
		columns: {
			id: true,
			name: true,
			slug: true,
			stock: true,
			status: true,
			deletedAt: true,
		},
		where: and(
			eq(ProductsTable.id, productId),
			isNull(ProductsTable.deletedAt),
		),
	});

	if (!product) {
		log.info("restock.skip", {
			reason: "product_missing",
			product_id: productId,
		});
		log.emit();
		return { notified: 0, failed: 0 };
	}

	if (product.status !== "active" || product.stock <= 0) {
		log.info("restock.skip", {
			reason: "product_not_sellable",
			product_id: productId,
			product_status: product.status,
			product_stock: product.stock,
		});
		log.emit();
		return { notified: 0, failed: 0 };
	}

	const subscriptions = await db().query.RestockSubscriptionsTable.findMany({
		where: and(
			eq(RestockSubscriptionsTable.productId, productId),
			isNull(RestockSubscriptionsTable.deletedAt),
			isNull(RestockSubscriptionsTable.notifiedAt),
		),
	});

	if (subscriptions.length === 0) {
		return { notified: 0, failed: 0 };
	}

	let notified = 0;
	let failed = 0;
	const now = new Date();

	for (const sub of subscriptions) {
		const claimed = await claimSubscription(sub.id, now);
		if (!claimed) {
			continue;
		}

		try {
			await sendRestockNotification({
				channel: claimed.channel,
				contact: claimed.contact,
				productName: product.name,
				productSlug: product.slug,
				productId: product.id,
			});
			await completeSubscription(claimed.id, new Date());
			notified += 1;
		} catch (error) {
			failed += 1;
			try {
				await reopenSubscription(claimed.id);
			} catch (reopenError) {
				log.error(
					reopenError instanceof Error
						? reopenError
						: new Error(String(reopenError)),
					{
						event: "restock.reopen_failed",
						product_id: productId,
						subscription_id: claimed.id,
						channel: claimed.channel,
					},
				);
			}
			log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "restock.notify_failed",
				product_id: productId,
				subscription_id: claimed.id,
				channel: claimed.channel,
			});
		}
	}

	log.info("restock.dispatch_complete", {
		product_id: productId,
		notified,
		failed,
		total: subscriptions.length,
	});
	log.emit();

	return { notified, failed };
}

export async function dispatchRestockIfCrossedZero(input: {
	productId: number;
	previousStock: number;
	newStock: number;
}) {
	if (!shouldDispatchRestock(input)) {
		return { notified: 0, failed: 0, skipped: true as const };
	}

	const result = await notifyRestockSubscribers(input.productId);
	return { ...result, skipped: false as const };
}

type WaitUntilContext = {
	c: { executionCtx: ExecutionContext };
	log: RequestLogger<any>;
};

export function scheduleRestockDispatch(
	ctx: WaitUntilContext,
	input: {
		productId: number;
		previousStock: number;
		newStock: number;
	},
): void {
	if (!shouldDispatchRestock(input)) {
		return;
	}

	ctx.c.executionCtx.waitUntil(
		notifyRestockSubscribers(input.productId).catch((error) => {
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "restock.dispatch_failed",
				product_id: input.productId,
			});
		}),
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
	for (const candidate of candidates) {
		scheduleRestockDispatch(ctx, candidate);
	}
}

async function reclaimStaleClaims() {
	const cutoff = new Date(Date.now() - STALE_CLAIM_MS);
	const stale = await db()
		.select({
			id: RestockSubscriptionsTable.id,
		})
		.from(RestockSubscriptionsTable)
		.where(
			and(
				isNull(RestockSubscriptionsTable.deletedAt),
				isNotNull(RestockSubscriptionsTable.notifiedAt),
				lt(RestockSubscriptionsTable.notifiedAt, cutoff),
			),
		);

	let reclaimed = 0;
	for (const row of stale) {
		try {
			await reopenSubscription(row.id);
			reclaimed += 1;
		} catch {}
	}
	return reclaimed;
}

export async function runRestockSafetyNet() {
	const reclaimed = await reclaimStaleClaims();

	const openSubs = await db()
		.selectDistinct({ productId: RestockSubscriptionsTable.productId })
		.from(RestockSubscriptionsTable)
		.innerJoin(
			ProductsTable,
			eq(ProductsTable.id, RestockSubscriptionsTable.productId),
		)
		.where(
			and(
				isNull(RestockSubscriptionsTable.deletedAt),
				isNull(RestockSubscriptionsTable.notifiedAt),
				isNull(ProductsTable.deletedAt),
				eq(ProductsTable.status, "active"),
				gt(ProductsTable.stock, 0),
			),
		);

	let totalNotified = 0;
	let totalFailed = 0;

	for (const row of openSubs) {
		const result = await notifyRestockSubscribers(row.productId);
		totalNotified += result.notified;
		totalFailed += result.failed;
	}

	return {
		productsChecked: openSubs.length,
		reclaimed,
		notified: totalNotified,
		failed: totalFailed,
	};
}
