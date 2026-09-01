import { eq, sql } from "drizzle-orm";
import { db } from "~/db/client";
import { MessengerNotificationFailuresTable } from "~/db/schema";
import {
	type DetailedOrderNotificationInput,
	sendDetailedOrderNotification,
} from "~/lib/integrations/admin-notifications";

export const ORDER_CONFIRMATION_PURPOSE = "order_payment_confirmed";

type PersistFailureInput = {
	error: unknown;
	payload: DetailedOrderNotificationInput;
	paymentNumber: string;
};

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const errorCode = (error: unknown) => {
	if (error && typeof error === "object" && "code" in error) {
		return String((error as { code?: unknown }).code ?? "");
	}
	return null;
};

export async function persistMessengerNotificationFailure({
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
		await sendDetailedOrderNotification(failure.payload as DetailedOrderNotificationInput);
		await db()
			.update(MessengerNotificationFailuresTable)
			.set({ errorCode: null, errorMessage: null, lastAttemptAt: new Date(), status: "sent" })
			.where(eq(MessengerNotificationFailuresTable.id, id));
		return { ok: true as const };
	} catch (error) {
		await db()
			.update(MessengerNotificationFailuresTable)
			.set({
				errorCode: errorCode(error),
				errorMessage: errorMessage(error),
				lastAttemptAt: new Date(),
				retryCount: sql`${MessengerNotificationFailuresTable.retryCount} + 1`,
				status: "pending",
			})
			.where(eq(MessengerNotificationFailuresTable.id, id));
		return { error, ok: false as const, reason: "send_failed" as const };
	}
}
