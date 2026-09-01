import { TRPCError } from "@trpc/server";
import { and, countDistinct, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import * as v from "valibot";
import { db } from "~/db/client";
import {
	BrandsTable,
	ProductImagesTable,
	ProductsTable,
	RestockSubscriptionsTable,
} from "~/db/schema";
import { MAX_OPEN_PRODUCTS_PER_CONTACT } from "~/lib/restock/dispatch";
import { isValidRestockContact, normalizeRestockContact } from "~/lib/restock/normalize";
import { enforceRestockRateLimit } from "~/lib/restock/rate-limit";

type RestockContact = {
	channel: "sms" | "email";
	contact: string;
};

type SubscribeResult = {
	alreadySubscribed: boolean;
	channel: "sms" | "email";
};

const CONTACT_RATE_LIMIT = 20;
const CONTACT_RATE_WINDOW_SECONDS = 24 * 60 * 60;
const IP_RATE_LIMIT = 60;

const openSubscription = and(
	isNull(RestockSubscriptionsTable.deletedAt),
	eq(RestockSubscriptionsTable.consentState, "verified"),
	sql`${RestockSubscriptionsTable.deliveryState} in ('pending', 'sending')`,
);

function normalizeAndValidateContact(input: RestockContact): RestockContact {
	const contact = normalizeRestockContact(input.channel, input.contact);
	if (!isValidRestockContact(input.channel, contact)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: input.channel === "sms" ? "Invalid phone number" : "Invalid email address",
		});
	}
	return { channel: input.channel, contact };
}

const uniqueConflictMessageSchema = v.object({
	message: v.string(),
});

function isUniqueConflict(error: v.InferOutput<typeof uniqueConflictMessageSchema>): boolean {
	const message = error.message;
	return (
		message.includes("restock_sub_open_unique_idx") ||
		message.includes("unique") ||
		message.includes("duplicate")
	);
}

type Tx = Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0];

async function assertProductOutOfStock(tx: Tx, productId: number) {
	const [product] = await tx
		.select({ status: ProductsTable.status, stock: ProductsTable.stock })
		.from(ProductsTable)
		.where(and(eq(ProductsTable.id, productId), isNull(ProductsTable.deletedAt)))
		.for("update");
	if (!product || product.status === "draft") {
		throw new TRPCError({ code: "NOT_FOUND", message: "Product not found" });
	}
	if (product.stock > 0) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Product is already in stock",
		});
	}
}

async function insertOneContact(
	tx: Tx,
	productId: number,
	item: RestockContact,
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
			alreadySubscribed: true,
			channel: item.channel,
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
			code: "FORBIDDEN",
			message: "Too many open restock waitlists for this contact",
		});
	}

	try {
		await tx.insert(RestockSubscriptionsTable).values({
			channel: item.channel,
			consentState: "verified",
			contact: item.contact,
			deliveryKey: `restock-${crypto.randomUUID()}`,
			productId,
		});
		return {
			alreadySubscribed: false,
			channel: item.channel,
		};
	} catch (error) {
		if (error instanceof TRPCError) {
			throw error;
		}
		if (error instanceof Error && isUniqueConflict({ message: error.message })) {
			return {
				alreadySubscribed: true,
				channel: item.channel,
			};
		}
		throw error;
	}
}

export async function createVerifiedRestockSubscription(input: {
	channel: "sms" | "email";
	contact: string;
	productId: number;
}) {
	const contact = normalizeAndValidateContact(input);
	let result: SubscribeResult;
	try {
		result = await db().transaction(async (tx) => {
			await assertProductOutOfStock(tx, input.productId);
			await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${contact.contact}, 0))`);
			return insertOneContact(tx, input.productId, contact);
		});
	} catch (error) {
		if (error instanceof TRPCError) {
			throw error;
		}
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to create restock subscription",
		});
	}

	return {
		alreadySubscribed: result.alreadySubscribed,
		message: result.alreadySubscribed ? "Already subscribed" : "Subscription created",
		results: [result],
		success: true as const,
	};
}

export async function subscribeVerifiedPhoneToRestock(input: {
	productId: number;
	requestIp: string;
	verifiedPhone: string;
}) {
	const contact = normalizeAndValidateContact({
		channel: "sms",
		contact: input.verifiedPhone,
	});
	await Promise.all([
		enforceRestockRateLimit({
			action: "subscribe",
			limit: CONTACT_RATE_LIMIT,
			scope: "contact",
			value: contact.contact,
			windowSeconds: CONTACT_RATE_WINDOW_SECONDS,
		}),
		enforceRestockRateLimit({
			action: "subscribe",
			limit: IP_RATE_LIMIT,
			scope: "ip",
			value: input.requestIp,
			windowSeconds: CONTACT_RATE_WINDOW_SECONDS,
		}),
	]);
	return createVerifiedRestockSubscription({
		productId: input.productId,
		...contact,
	});
}

export async function getRestockWaitCount(productId: number): Promise<number> {
	const [row] = await db()
		.select({ c: countDistinct(RestockSubscriptionsTable.contact) })
		.from(RestockSubscriptionsTable)
		.where(and(eq(RestockSubscriptionsTable.productId, productId), openSubscription));

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
			brandName: BrandsTable.name,
			name: ProductsTable.name,
			productId: RestockSubscriptionsTable.productId,
			slug: ProductsTable.slug,
			status: ProductsTable.status,
			stock: ProductsTable.stock,
			waitCount: countDistinct(RestockSubscriptionsTable.contact),
		})
		.from(RestockSubscriptionsTable)
		.innerJoin(ProductsTable, eq(ProductsTable.id, RestockSubscriptionsTable.productId))
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
			isPrimary: ProductImagesTable.isPrimary,
			productId: ProductImagesTable.productId,
			url: ProductImagesTable.url,
		})
		.from(ProductImagesTable)
		.where(
			and(inArray(ProductImagesTable.productId, productIds), isNull(ProductImagesTable.deletedAt)),
		);

	const imageByProduct = new Map<number, string>();
	for (const image of images) {
		const existing = imageByProduct.get(image.productId);
		if (!existing || image.isPrimary) {
			imageByProduct.set(image.productId, image.url);
		}
	}

	return ranked.map((row) => ({
		brandName: row.brandName ?? null,
		image: imageByProduct.get(row.productId) ?? null,
		name: row.name,
		productId: row.productId,
		slug: row.slug,
		status: row.status,
		stock: row.stock,
		waitCount: Number(row.waitCount),
	}));
}
