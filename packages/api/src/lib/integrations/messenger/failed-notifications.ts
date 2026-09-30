import { eq, sql } from "drizzle-orm";
import * as v from "valibot";
import { db } from "~/db/client";
import { MessengerNotificationFailuresTable } from "~/db/schema";
import {
	detailedOrderNotificationInputSchema,
	type DetailedOrderNotificationInput,
	sendDetailedOrderNotification,
} from "~/lib/integrations/admin-notifications";

export const ORDER_CONFIRMATION_PURPOSE = "order_payment_confirmed";

const integrationFailureErrorSchema = v.looseObject({
	code: v.optional(v.union([v.string(), v.number()])),
	message: v.optional(v.string()),
});

type IntegrationFailureError = Error | v.InferOutput<typeof integrationFailureErrorSchema>;

type PersistFailureInput = {
	error: IntegrationFailureError;
	payload: DetailedOrderNotificationInput;
	paymentNumber: string;
};

const parseIntegrationFailureError = (
	rawError: IntegrationFailureError,
): IntegrationFailureError => {
	if (rawError instanceof Error) {
		return rawError;
	}
	const parsed = v.safeParse(integrationFailureErrorSchema, rawError);
	if (parsed.success) {
		return parsed.output;
	}
	return { message: String(rawError) };
};

const errorMessage = (error: IntegrationFailureError) => {
	if (error instanceof Error) {
		return error.message;
	}
	return error.message ?? "Unknown error";
};

const errorCode = (error: IntegrationFailureError) => {
	if (error instanceof Error) {
		const parsed = v.safeParse(integrationFailureErrorSchema, error);
		if (parsed.success && parsed.output.code != null) {
			return String(parsed.output.code);
		}
		return null;
	}
	if (error.code != null) {
		return String(error.code);
	}
	return null;
};

export async function persistMessengerNotificationFailure({
	error: rawError,
	payload,
	paymentNumber,
}: {
	error: IntegrationFailureError;
	payload: DetailedOrderNotificationInput;
	paymentNumber: string;
}) {
	await persistNormalizedMessengerNotificationFailure({
		error: parseIntegrationFailureError(rawError),
		payload,
		paymentNumber,
	});
}

async function persistNormalizedMessengerNotificationFailure({
	error,
	payload,
	paymentNumber,
}: PersistFailureInput) {
	await db()
		.insert(MessengerNotificationFailuresTable)
		.values({
			errorCode: errorCode(error),
			errorMessage: errorMessage(error),
			lastAttemptAt: new Date(),
			payload,
			paymentNumber,
			purpose: ORDER_CONFIRMATION_PURPOSE,
			retryCount: 1,
			status: "pending",
		})
		.onConflictDoUpdate({
			set: {
				errorCode: errorCode(error),
				errorMessage: errorMessage(error),
				lastAttemptAt: new Date(),
				payload,
				retryCount: sql`${MessengerNotificationFailuresTable.retryCount} + 1`,
				status: "pending",
				updatedAt: new Date(),
			},
			target: [
				MessengerNotificationFailuresTable.paymentNumber,
				MessengerNotificationFailuresTable.purpose,
			],
		});
}

export async function retryMessengerNotificationFailure(id: number) {
	const failure = await db().query.MessengerNotificationFailuresTable.findFirst({
		where: eq(MessengerNotificationFailuresTable.id, id),
	});

	if (!failure) {
		return { ok: false as const, reason: "not_found" as const };
	}
	if (failure.status === "sent") {
		return { alreadySent: true, ok: true as const };
	}

	try {
		const payload = v.parse(detailedOrderNotificationInputSchema, failure.payload);
		await sendDetailedOrderNotification(payload);
		await db()
			.update(MessengerNotificationFailuresTable)
			.set({ errorCode: null, errorMessage: null, lastAttemptAt: new Date(), status: "sent" })
			.where(eq(MessengerNotificationFailuresTable.id, id));
		return { ok: true as const };
	} catch (rawError) {
		const normalizedError = parseIntegrationFailureError(
			rawError instanceof Error ? rawError : { message: String(rawError) },
		);
		await db()
			.update(MessengerNotificationFailuresTable)
			.set({
				errorCode: errorCode(normalizedError),
				errorMessage: errorMessage(normalizedError),
				lastAttemptAt: new Date(),
				retryCount: sql`${MessengerNotificationFailuresTable.retryCount} + 1`,
				status: "pending",
			})
			.where(eq(MessengerNotificationFailuresTable.id, id));
		return { error: rawError, ok: false as const, reason: "send_failed" as const };
	}
}
