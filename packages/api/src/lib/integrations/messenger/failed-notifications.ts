import { eq, sql } from "drizzle-orm";
import { db } from "~/db/client";
import { MessengerNotificationFailuresTable } from "~/db/schema";
import type { DetailedOrderNotificationInput } from "~/lib/integrations/messenger/messages";
import { sendDetailedOrderNotification } from "~/lib/integrations/messenger/messages";

export const ORDER_CONFIRMATION_PURPOSE = "order_payment_confirmed";

type PersistFailureInput = {
	paymentNumber: string;
	payload: DetailedOrderNotificationInput;
	error: unknown;
};

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const errorCode = (error: unknown) => {
	if (error && typeof error === "object" && "code" in error) {
		return String((error as { code?: unknown }).code ?? "");
	}
	return null;
};

export async function persistMessengerNotificationFailure({
	paymentNumber,
	payload,
	error,
}: PersistFailureInput) {
	await db()
		.insert(MessengerNotificationFailuresTable)
		.values({
			paymentNumber,
			purpose: ORDER_CONFIRMATION_PURPOSE,
			status: "pending",
			payload,
			errorMessage: errorMessage(error),
			errorCode: errorCode(error),
			retryCount: 1,
			lastAttemptAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [
				MessengerNotificationFailuresTable.paymentNumber,
				MessengerNotificationFailuresTable.purpose,
			],
			set: {
				status: "pending",
				payload,
				errorMessage: errorMessage(error),
				errorCode: errorCode(error),
				retryCount: sql`${MessengerNotificationFailuresTable.retryCount} + 1`,
				lastAttemptAt: new Date(),
				updatedAt: new Date(),
			},
		});
}

export async function retryMessengerNotificationFailure(id: number) {
	const failure = await db().query.MessengerNotificationFailuresTable.findFirst({
		where: eq(MessengerNotificationFailuresTable.id, id),
	});

	if (!failure) return { ok: false as const, reason: "not_found" as const };
	if (failure.status === "sent") return { ok: true as const, alreadySent: true };

	try {
		await sendDetailedOrderNotification(
			failure.payload as DetailedOrderNotificationInput,
		);
		await db()
			.update(MessengerNotificationFailuresTable)
			.set({ status: "sent", errorMessage: null, errorCode: null, lastAttemptAt: new Date() })
			.where(eq(MessengerNotificationFailuresTable.id, id));
		return { ok: true as const };
	} catch (error) {
		await db()
			.update(MessengerNotificationFailuresTable)
			.set({
				status: "pending",
				errorMessage: errorMessage(error),
				errorCode: errorCode(error),
				retryCount: sql`${MessengerNotificationFailuresTable.retryCount} + 1`,
				lastAttemptAt: new Date(),
			})
			.where(eq(MessengerNotificationFailuresTable.id, id));
		return { ok: false as const, reason: "send_failed" as const, error };
	}
}
