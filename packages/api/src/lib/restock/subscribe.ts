import { TRPCError } from "@trpc/server";
import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "~/db/client";
import { RestockSubscriptionsTable } from "~/db/schema";
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
	contact: string;
	alreadySubscribed: boolean;
};

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
			isNull(RestockSubscriptionsTable.deletedAt),
		),
	});

	if (existing) {
		return {
			channel: item.channel,
			contact: item.contact,
			alreadySubscribed: true,
		};
	}

	const openProductCounts = await tx
		.select({
			productId: RestockSubscriptionsTable.productId,
			c: count(),
		})
		.from(RestockSubscriptionsTable)
		.where(
			and(
				eq(RestockSubscriptionsTable.contact, item.contact),
				isNull(RestockSubscriptionsTable.deletedAt),
				ne(RestockSubscriptionsTable.productId, productId),
			),
		)
		.groupBy(RestockSubscriptionsTable.productId);

	if (openProductCounts.length >= MAX_OPEN_PRODUCTS_PER_CONTACT) {
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
		});
		return {
			channel: item.channel,
			contact: item.contact,
			alreadySubscribed: false,
		};
	} catch (error) {
		if (isUniqueConflict(error)) {
			return {
				channel: item.channel,
				contact: item.contact,
				alreadySubscribed: true,
			};
		}
		throw error;
	}
}

export async function subscribeToRestock(input: {
	productId: number;
	contacts: RestockContactInput[];
}) {
	const contacts = normalizeAndValidateContacts(input.contacts);

	const results = await db().transaction(async (tx) => {
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

export async function getRestockWaitCount(productId: number): Promise<number> {
	const [row] = await db()
		.select({ c: count() })
		.from(RestockSubscriptionsTable)
		.where(
			and(
				eq(RestockSubscriptionsTable.productId, productId),
				isNull(RestockSubscriptionsTable.deletedAt),
			),
		);

	return Number(row?.c ?? 0);
}

export async function listRestockWaitCounts(limit = 50) {
	const rows = await db()
		.select({
			productId: RestockSubscriptionsTable.productId,
			waitCount: count(),
		})
		.from(RestockSubscriptionsTable)
		.where(isNull(RestockSubscriptionsTable.deletedAt))
		.groupBy(RestockSubscriptionsTable.productId)
		.orderBy(sql`count(*) desc`)
		.limit(limit);

	return rows.map((row) => ({
		productId: row.productId,
		waitCount: Number(row.waitCount),
	}));
}
