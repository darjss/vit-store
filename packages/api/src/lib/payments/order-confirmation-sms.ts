import { smsGateway } from "~/lib/integrations";
import { logger } from "~/lib/logger";

const PRODUCTION_STORE_URL = "https://amerikvitamin.mn";
const MN_PHONE_RE = /^[6-9]\d{7}$/;
const SMS_SUCCESS_STATES = new Set(["Sent", "Delivered"]);

export type OrderConfirmationSmsInput = {
	paymentNumber: string;
	orderNumber: string;
	customerPhone: number;
	total: number;
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

		const finalState = await smsGateway.sendSmsAndWait({
			message,
			phoneNumbers: [`+976${phone}`],
		});

		if (!SMS_SUCCESS_STATES.has(finalState.state)) {
			logger.error(
				"order.sms_confirmation_failed",
				new Error(
					finalState.recipients[0]?.error ??
						`SMS not delivered (state=${finalState.state})`,
				),
				{
					paymentNumber: input.paymentNumber,
					orderNumber: input.orderNumber,
					phone: input.customerPhone,
					smsState: finalState.state,
				},
			);
			return;
		}

		logger.info("order.sms_confirmation_sent", {
			paymentNumber: input.paymentNumber,
			orderNumber: input.orderNumber,
			phone: input.customerPhone,
			smsState: finalState.state,
		});
	} catch (error) {
		logger.error("order.sms_confirmation_failed", error, {
			paymentNumber: input.paymentNumber,
			orderNumber: input.orderNumber,
			phone: input.customerPhone,
		});
	}
}
