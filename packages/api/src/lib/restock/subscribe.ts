import { TRPCError } from "@trpc/server";
import { and, countDistinct, eq, inArray, isNull, ne, sql } from "drizzle-orm";
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

function normalizeAndValidateContacts(
	contacts: RestockContactInput[],
): NormalizedContact[] {
	if (contacts.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "At least one contact is required",
		});
	}

	const seenChannels = new Set<string>();
	const normalized: NormalizedContact[] = [];

	for (const item of contacts) {
		if (seenChannels.has(item.channel)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Duplicate channel: ${item.channel}`,
			});
		}
		seenChannels.add(item.channel);

		const contact = normalizeRestockContact(item.channel, item.contact);
		if (!isValidRestockContact(item.channel, contact)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					item.channel === "sms"
						? "Invalid phone number"
						: "Invalid email address",
			});
		}
		normalized.push({ channel: item.channel, contact });
	}

	return normalized;
}

function isUniqueConflict(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return (
		message.includes("restock_sub_open_unique_idx") ||
		message.includes("unique") ||
		message.includes("duplicate")
	);
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

async function insertOneContact(
	tx: Tx,
	productId: number,
	item: NormalizedContact,
): Promise<SubscribeResult> {
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
		return {
			channel: item.channel,
			alreadySubscribed: true,
		};
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
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Too many open restock waitlists for this contact",
		});
	}

	try {
		await tx.insert(RestockSubscriptionsTable).values({
			productId,
			channel: item.channel,
			contact: item.contact,
			deliveryKey: `restock-${crypto.randomUUID()}`,
			consentState: "verified",
		});
		return {
			channel: item.channel,
			alreadySubscribed: false,
		};
	} catch (error) {
		if (isUniqueConflict(error)) {
			return {
				channel: item.channel,
				alreadySubscribed: true,
			};
		}
		throw error;
	}
}

export async function subscribeToRestock(input: {
	productId: number;
	contacts: RestockContactInput[];
	verifiedPhone: string;
	requestIp: string;
}) {
	const contacts = normalizeAndValidateContacts(input.contacts);
	if (
		contacts.length !== 1 ||
		contacts[0]?.channel !== "sms" ||
		contacts[0].contact !== normalizeRestockContact("sms", input.verifiedPhone)
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Verified phone ownership is required",
		});
	}
	await Promise.all([
		enforceRateLimit("contact", contacts[0].contact, CONTACT_RATE_LIMIT),
		enforceRateLimit("ip", input.requestIp, IP_RATE_LIMIT),
	]);

	const results = await db().transaction(async (tx) => {
		const contactsToLock = [
			...new Set(contacts.map((item) => item.contact)),
		].sort();
		for (const contact of contactsToLock) {
			await tx.execute(
				sql`select pg_advisory_xact_lock(hashtextextended(${contact}, 0))`,
			);
		}
		const out: SubscribeResult[] = [];
		for (const item of contacts) {
			out.push(await insertOneContact(tx, input.productId, item));
		}
		return out;
	});

	const allAlready = results.every((r) => r.alreadySubscribed);

	return {
		success: true as const,
		message: allAlready ? "Already subscribed" : "Subscription created",
		alreadySubscribed: allAlready,
		results,
	};
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
	const count = await redis().incr(key);
	if (count === 1) await redis().expire(key, CONTACT_RATE_WINDOW_SECONDS);
	if (count > limit) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: "Too many restock subscription requests",
		});
	}
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

	if (ranked.length === 0) {
		return [];
	}

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
		if (!existing || image.isPrimary) {
			imageByProduct.set(image.productId, image.url);
		}
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
