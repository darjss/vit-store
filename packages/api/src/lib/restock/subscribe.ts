import type { RestockError, RestockSubscriptionResult } from "@vit/shared";
import { Result } from "better-result";
import { and, countDistinct, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { restockErrors } from "~/errors/factories/restock";
import { db } from "~/db/client";
import {
	BrandsTable,
	ProductImagesTable,
	ProductsTable,
	RestockSubscriptionsTable,
} from "~/db/schema";
import { redis } from "~/lib/redis";
import { MAX_OPEN_PRODUCTS_PER_CONTACT } from "~/lib/restock/dispatch";
import {
	isValidRestockContact,
	normalizeRestockContact,
} from "~/lib/restock/normalize";

export type RestockContactInput = {
	channel: "sms" | "email";
	contact: string;
};

type NormalizedContact = {
	channel: "sms" | "email";
	contact: string;
};

type SubscribeResult = {
	channel: "sms" | "email";
	alreadySubscribed: boolean;
};

const CONTACT_RATE_LIMIT = 20;
const CONTACT_RATE_WINDOW_SECONDS = 24 * 60 * 60;
const IP_RATE_LIMIT = 60;

const openSubscription = and(
	isNull(RestockSubscriptionsTable.deletedAt),
	eq(RestockSubscriptionsTable.consentState, "verified"),
	sql`${RestockSubscriptionsTable.deliveryState} in ('pending', 'sending')`,
);

export function normalizeRestockContacts(contacts: RestockContactInput[]) {
	if (contacts.length === 0) {
		return Result.err<NormalizedContact[], RestockError>(
			restockErrors.invalidContact("sms"),
		);
	}

	const seenChannels = new Set<string>();
	const normalized: NormalizedContact[] = [];
	for (const item of contacts) {
		if (seenChannels.has(item.channel)) {
			return Result.err<NormalizedContact[], RestockError>(
				restockErrors.invalidContact(item.channel),
			);
		}
		seenChannels.add(item.channel);

		const contact = normalizeRestockContact(item.channel, item.contact);
		if (!isValidRestockContact(item.channel, contact)) {
			return Result.err<NormalizedContact[], RestockError>(
				restockErrors.invalidContact(item.channel),
			);
		}
		normalized.push({ channel: item.channel, contact });
	}
	return Result.ok<NormalizedContact[], RestockError>(normalized);
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

async function insertOneContact(
	tx: Tx,
	productId: number,
	item: NormalizedContact,
) {
	const existing = await tx.query.RestockSubscriptionsTable.findFirst({
		columns: { id: true },
		where: and(
			eq(RestockSubscriptionsTable.productId, productId),
			eq(RestockSubscriptionsTable.channel, item.channel),
			eq(RestockSubscriptionsTable.contact, item.contact),
			openSubscription,
		),
	});
	if (existing) {
		return Result.ok<SubscribeResult, RestockError>({
			channel: item.channel,
			alreadySubscribed: true,
		});
	}

	const [openProductCount] = await tx
		.select({ c: countDistinct(RestockSubscriptionsTable.productId) })
		.from(RestockSubscriptionsTable)
		.where(
			and(
				eq(RestockSubscriptionsTable.contact, item.contact),
				openSubscription,
				ne(RestockSubscriptionsTable.productId, productId),
			),
		);
	if (Number(openProductCount?.c ?? 0) >= MAX_OPEN_PRODUCTS_PER_CONTACT) {
		return Result.err<SubscribeResult, RestockError>(
			restockErrors.subscriptionLimitReached(),
		);
	}

	const inserted = await tx
		.insert(RestockSubscriptionsTable)
		.values({
			productId,
			channel: item.channel,
			contact: item.contact,
			deliveryKey: `restock-${crypto.randomUUID()}`,
			consentState: "verified",
		})
		.onConflictDoNothing()
		.returning({ id: RestockSubscriptionsTable.id });
	return Result.ok<SubscribeResult, RestockError>({
		channel: item.channel,
		alreadySubscribed: inserted.length === 0,
	});
}

export async function subscribeToRestock(input: {
	productId: number;
	contacts: RestockContactInput[];
	verifiedPhone: string;
	requestIp: string;
}) {
	const contactsResult = normalizeRestockContacts(input.contacts);
	if (contactsResult.status === "error") {
		return Result.err<RestockSubscriptionResult, RestockError>(
			contactsResult.error,
		);
	}
	const contacts = contactsResult.value;
	if (
		contacts.length !== 1 ||
		contacts[0]?.channel !== "sms" ||
		contacts[0].contact !== normalizeRestockContact("sms", input.verifiedPhone)
	) {
		return Result.err<RestockSubscriptionResult, RestockError>(
			restockErrors.contactNotVerified(),
		);
	}

	for (const rateLimit of [
		await enforceRateLimit("contact", contacts[0].contact, CONTACT_RATE_LIMIT),
		await enforceRateLimit("ip", input.requestIp, IP_RATE_LIMIT),
	]) {
		if (rateLimit.status === "error") {
			return Result.err<RestockSubscriptionResult, RestockError>(
				rateLimit.error,
			);
		}
	}

	const transactionResult = await db().transaction(async (tx) => {
		const contactsToLock = [
			...new Set(contacts.map((item) => item.contact)),
		].sort();
		for (const contact of contactsToLock) {
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtextextended(${contact}, 0))`,
			);
		}

		const results: SubscribeResult[] = [];
		for (const item of contacts) {
			const inserted = await insertOneContact(tx, input.productId, item);
			if (inserted.status === "error") {
				return Result.err<SubscribeResult[], RestockError>(inserted.error);
			}
			results.push(inserted.value);
		}
		return Result.ok<SubscribeResult[], RestockError>(results);
	});
	if (transactionResult.status === "error") {
		return Result.err<RestockSubscriptionResult, RestockError>(
			transactionResult.error,
		);
	}

	const allAlready = transactionResult.value.every(
		(result) => result.alreadySubscribed,
	);
	return Result.ok<RestockSubscriptionResult, RestockError>({
		success: true,
		message: allAlready ? "Already subscribed" : "Subscription created",
		alreadySubscribed: allAlready,
		results: transactionResult.value,
	});
}

async function enforceRateLimit(
	scope: "contact" | "ip",
	value: string,
	limit: number,
) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	const hash = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
	const key = `restock:subscribe:${scope}:${hash}`;
	const client = redis();
	const count = await client.incr(key);
	if (count === 1) await client.expire(key, CONTACT_RATE_WINDOW_SECONDS);
	if (count <= limit) {
		return Result.ok<void, RestockError>(undefined);
	}

	const ttl = await client.ttl(key);
	return Result.err<void, RestockError>(
		restockErrors.rateLimited(ttl > 0 ? ttl : CONTACT_RATE_WINDOW_SECONDS),
	);
}

export async function getRestockWaitCount(productId: number): Promise<number> {
	const [row] = await db()
		.select({ c: countDistinct(RestockSubscriptionsTable.contact) })
		.from(RestockSubscriptionsTable)
		.where(
			and(eq(RestockSubscriptionsTable.productId, productId), openSubscription),
		);

	return Number(row?.c ?? 0);
}

export async function listRestockWaitCounts(limit = 50) {
	const rows = await db()
		.select({
			productId: RestockSubscriptionsTable.productId,
			waitCount: countDistinct(RestockSubscriptionsTable.contact),
		})
		.from(RestockSubscriptionsTable)
		.where(openSubscription)
		.groupBy(RestockSubscriptionsTable.productId)
		.orderBy(sql`count(distinct ${RestockSubscriptionsTable.contact}) desc`)
		.limit(limit);

	return rows.map((row) => ({
		productId: row.productId,
		waitCount: Number(row.waitCount),
	}));
}

export async function listRestockWaitlist(limit = 50) {
	const ranked = await db()
		.select({
			productId: RestockSubscriptionsTable.productId,
			waitCount: countDistinct(RestockSubscriptionsTable.contact),
			name: ProductsTable.name,
			slug: ProductsTable.slug,
			stock: ProductsTable.stock,
			status: ProductsTable.status,
			brandName: BrandsTable.name,
		})
		.from(RestockSubscriptionsTable)
		.innerJoin(
			ProductsTable,
			eq(ProductsTable.id, RestockSubscriptionsTable.productId),
		)
		.leftJoin(BrandsTable, eq(BrandsTable.id, ProductsTable.brandId))
		.where(and(openSubscription, isNull(ProductsTable.deletedAt)))
		.groupBy(
			RestockSubscriptionsTable.productId,
			ProductsTable.name,
			ProductsTable.slug,
			ProductsTable.stock,
			ProductsTable.status,
			BrandsTable.name,
		)
		.orderBy(sql`count(distinct ${RestockSubscriptionsTable.contact}) desc`)
		.limit(limit);

	if (ranked.length === 0) return [];

	const productIds = ranked.map((row) => row.productId);
	const images = await db()
		.select({
			productId: ProductImagesTable.productId,
			url: ProductImagesTable.url,
			isPrimary: ProductImagesTable.isPrimary,
		})
		.from(ProductImagesTable)
		.where(
			and(
				inArray(ProductImagesTable.productId, productIds),
				isNull(ProductImagesTable.deletedAt),
			),
		);

	const imageByProduct = new Map<number, string>();
	for (const image of images) {
		const existing = imageByProduct.get(image.productId);
		if (!existing || image.isPrimary)
			imageByProduct.set(image.productId, image.url);
	}

	return ranked.map((row) => ({
		productId: row.productId,
		waitCount: Number(row.waitCount),
		name: row.name,
		slug: row.slug,
		stock: row.stock,
		status: row.status,
		brandName: row.brandName ?? null,
		image: imageByProduct.get(row.productId) ?? null,
	}));
}
