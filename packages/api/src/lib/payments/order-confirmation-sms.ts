import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "~/db/client";
import { MessengerNotificationFailuresTable } from "~/db/schema";
import { smsGateway } from "~/lib/integrations";
import { logger } from "~/lib/logger";

export const SMS_ORDER_CONFIRMATION_PURPOSE = "sms_order_payment_confirmed";

const PRODUCTION_STORE_URL = "https://amerikvitamin.mn";
const MN_PHONE_RE = /^[6-9]\d{7}$/;

export type OrderConfirmationSmsInput = {
	paymentNumber: string;
	orderNumber: string;
	customerPhone: number;
	total: number;
};

type SmsPayload = {
	paymentNumber: string;
	orderNumber: string;
	customerPhone: number;
	total: number;
	message: string;
};

function getStorefrontBaseUrl(): string {
	const fromEnv =
		process.env.STORE_PUBLIC_URL ??
		process.env.PUBLIC_STORE_URL ??
		process.env.CORS_ORIGIN?.split(",")
			.map((origin) => origin.trim())
			.find(
				(origin) =>
					origin.includes("amerikvitamin.mn") &&
					!origin.includes("admin") &&
					!origin.includes("api") &&
					!origin.includes("staging"),
			);

	if (fromEnv && fromEnv.length > 0) {
		return fromEnv.replace(/\/$/, "");
	}

	return PRODUCTION_STORE_URL;
}

export function buildOrderConfirmationSmsMessage(input: {
	orderNumber: string;
	total: number;
}): string {
	const amount = `${input.total.toLocaleString("en-US")}₮`;
	const trackUrl = `${getStorefrontBaseUrl()}/order-tracking`;
	return `Захиалга #${input.orderNumber} баталгаажлаа. Нийт: ${amount}. Хянах: ${trackUrl}`;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown) {
	if (error && typeof error === "object" && "code" in error) {
		return String((error as { code?: unknown }).code ?? "") || null;
	}
	return null;
}

async function claimSmsSend(payload: SmsPayload): Promise<boolean> {
	const [row] = await db()
		.insert(MessengerNotificationFailuresTable)
		.values({
			paymentNumber: payload.paymentNumber,
			purpose: SMS_ORDER_CONFIRMATION_PURPOSE,
			status: "pending",
			payload,
			retryCount: 0,
			lastAttemptAt: new Date(),
		})
		.onConflictDoUpdate({
			target: [
				MessengerNotificationFailuresTable.paymentNumber,
				MessengerNotificationFailuresTable.purpose,
			],
			set: {
				payload,
				lastAttemptAt: new Date(),
				updatedAt: new Date(),
				retryCount: sql`${MessengerNotificationFailuresTable.retryCount} + 1`,
			},
			setWhere: ne(MessengerNotificationFailuresTable.status, "sent"),
		})
		.returning({
			id: MessengerNotificationFailuresTable.id,
			status: MessengerNotificationFailuresTable.status,
		});

	if (!row) {
		return false;
	}

	return row.status !== "sent";
}

async function markSmsSent(paymentNumber: string) {
	await db()
		.update(MessengerNotificationFailuresTable)
		.set({
			status: "sent",
			errorMessage: null,
			errorCode: null,
			lastAttemptAt: new Date(),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(MessengerNotificationFailuresTable.paymentNumber, paymentNumber),
				eq(MessengerNotificationFailuresTable.purpose, SMS_ORDER_CONFIRMATION_PURPOSE),
			),
		);
}

async function markSmsFailed(paymentNumber: string, payload: SmsPayload, error: unknown) {
	await db()
		.update(MessengerNotificationFailuresTable)
		.set({
			status: "pending",
			payload,
			errorMessage: errorMessage(error),
			errorCode: errorCode(error),
			lastAttemptAt: new Date(),
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(MessengerNotificationFailuresTable.paymentNumber, paymentNumber),
				eq(MessengerNotificationFailuresTable.purpose, SMS_ORDER_CONFIRMATION_PURPOSE),
			),
		);
}

export async function sendOrderConfirmationSms(
	input: OrderConfirmationSmsInput,
): Promise<void> {
	try {
		const phone = String(input.customerPhone);
		if (!MN_PHONE_RE.test(phone)) {
			logger.warn("order.sms_confirmation_skipped", {
				paymentNumber: input.paymentNumber,
				orderNumber: input.orderNumber,
				reason: "invalid_phone",
			});
			return;
		}

		const message = buildOrderConfirmationSmsMessage({
			orderNumber: input.orderNumber,
			total: input.total,
		});

		const payload: SmsPayload = {
			paymentNumber: input.paymentNumber,
			orderNumber: input.orderNumber,
			customerPhone: input.customerPhone,
			total: input.total,
			message,
		};

		const claimed = await claimSmsSend(payload);
		if (!claimed) {
			logger.info("order.sms_confirmation_skipped", {
				paymentNumber: input.paymentNumber,
				orderNumber: input.orderNumber,
				reason: "already_sent",
			});
			return;
		}

		try {
			const finalState = await smsGateway.sendSmsAndWait({
				message,
				phoneNumbers: [`+976${phone}`],
			});

			if (finalState.state === "Failed") {
				throw new Error(finalState.recipients[0]?.error ?? "Unknown SMS error");
			}

			await markSmsSent(input.paymentNumber);
			logger.info("order.sms_confirmation_sent", {
				paymentNumber: input.paymentNumber,
				orderNumber: input.orderNumber,
				phone: input.customerPhone,
			});
		} catch (error) {
			try {
				await markSmsFailed(input.paymentNumber, payload, error);
			} catch {
				// Payment confirmation already succeeded; failure bookkeeping must not throw.
			}
			logger.error("order.sms_confirmation_failed", error, {
				paymentNumber: input.paymentNumber,
				orderNumber: input.orderNumber,
				phone: input.customerPhone,
			});
		}
	} catch (error) {
		logger.error("order.sms_confirmation_failed", error, {
			paymentNumber: input.paymentNumber,
			orderNumber: input.orderNumber,
			phone: input.customerPhone,
		});
	}
}
