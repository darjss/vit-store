import { smsGateway } from "~/lib/integrations";
import { logger } from "~/lib/logger";

const MN_PHONE_RE = /^[6-9]\d{7}$/;
const SMS_SUCCESS_STATES = new Set(["Sent", "Delivered"]);

export type OrderConfirmationSmsInput = {
	paymentNumber: string;
	orderNumber: string;
	customerPhone: number;
	total: number;
};

function getStorefrontBaseUrl(): string {
	const value = process.env.STORE_PUBLIC_URL;
	if (!value) throw new Error("STORE_PUBLIC_URL is required");
	const url = new URL(value);
	if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("STORE_PUBLIC_URL must be a canonical https origin");
	return url.origin;
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
			throw new Error("invalid_phone");
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
					smsState: finalState.state,
				},
			);
			throw new Error(`sms_state_${finalState.state}`);
		}

		logger.info("order.sms_confirmation_sent", {
			paymentNumber: input.paymentNumber,
			orderNumber: input.orderNumber,
			smsState: finalState.state,
		});
	} catch (error) {
		logger.error("order.sms_confirmation_failed", error, {
			paymentNumber: input.paymentNumber,
			orderNumber: input.orderNumber,
		});
		throw error;
	}
}
