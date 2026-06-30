import { paymentQueries } from "~/queries/payments";
import { persistMessengerNotificationFailure } from "~/lib/integrations/messenger/failed-notifications";
import {
	type DetailedOrderNotificationInput,
	sendDetailedOrderNotification,
} from "~/lib/integrations/messenger/messages";
import { trackOrderPlacedServerSide, trackPaymentConfirmedServerSide } from "~/lib/integrations/posthog";

type TransferConfirmationSource = "admin" | "auto_reconciliation" | "messenger";

type ConfirmTransferPaymentInput = {
	paymentNumber: string;
	source: TransferConfirmationSource;
	referrer?: string;
};

type ConfirmTransferPaymentResult =
	| { confirmed: true; orderNumber?: string }
	| { confirmed: false; reason: "already_confirmed_or_not_pending" };

export async function confirmTransferPaymentAndNotify({
	paymentNumber,
	referrer,
}: ConfirmTransferPaymentInput): Promise<ConfirmTransferPaymentResult> {
	const q = paymentQueries.store;
	const confirmed = await q.confirmPaymentAndApplyStock(
		paymentNumber,
		"transfer",
	);

	if (!confirmed) {
		return { confirmed: false, reason: "already_confirmed_or_not_pending" };
	}

	const paymentInfo = await q.getPaymentInfoByNumber(paymentNumber);
	if (!paymentInfo) {
		return { confirmed: true };
	}

	const notificationPayload: DetailedOrderNotificationInput = {
		paymentNumber,
		customerPhone: paymentInfo.order.customerPhone,
		address: paymentInfo.order.address,
		notes: paymentInfo.order.notes,
		total: paymentInfo.order.total,
		products: paymentInfo.order.orderDetails.map((detail) => ({
			name: detail.product.name,
			quantity: detail.quantity,
			price: detail.product.price,
			imageUrl: detail.product.images[0]?.url,
		})),
		status: "payment_confirmed",
	};

	try {
		await sendDetailedOrderNotification(notificationPayload);
	} catch (notificationError) {
		try {
			await persistMessengerNotificationFailure({
				paymentNumber,
				payload: notificationPayload,
				error: notificationError,
			});
		} catch {
			// Payment confirmation has already succeeded; notification storage must not roll it back.
		}
	}

	trackPaymentConfirmedServerSide({
		phone: paymentInfo.order.customerPhone?.toString() ?? paymentNumber,
		paymentNumber,
		orderNumber: paymentInfo.order.orderNumber,
		provider: "transfer",
		revenue: paymentInfo.order.total,
		referrer,
	}).catch(() => {});
	trackOrderPlacedServerSide({
		phone: paymentInfo.order.customerPhone?.toString() ?? paymentNumber,
		orderNumber: paymentInfo.order.orderNumber,
		paymentNumber,
		total: paymentInfo.order.total,
		provider: "transfer",
	}).catch(() => {});

	return {
		confirmed: true,
		orderNumber: paymentInfo.order.orderNumber,
	};
}
