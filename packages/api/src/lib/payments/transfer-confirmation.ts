import { paymentQueries } from "~/queries/payments";
import { KhaanTransactionAlreadyConsumedError } from "~/lib/payments/consumed-transaction";
import { persistMessengerNotificationFailure } from "~/lib/integrations/messenger/failed-notifications";
import {
	type DetailedOrderNotificationInput,
	sendDetailedOrderNotification,
} from "~/lib/integrations/messenger/messages";
import { sendOrderConfirmationSms } from "~/lib/payments/order-confirmation-sms";
import { trackOrderPlacedServerSide, trackPaymentConfirmedServerSide } from "~/lib/integrations/posthog";
import { PRODUCTS_TAG, productTag } from "@vit/shared";
import { purgeTagsGlobal } from "~/lib/cache/workers-cache";

// Canonical confirm + notify + analytics + cache-purge boundary (F2).
//
// Every payment confirm path — DO auto-reconciliation, messenger postback,
// admin manual transfer confirm, qpay checkout, qpay webhook — calls this.
// The consumed-Khaan-transaction ledger, customer notification, analytics,
// and storefront cache purge are all enforced here so they cannot be skipped
// or duplicated by a caller.
//
// `provider` is generalized (transfer | qpay); the consumed-Khaan ledger only
// applies to transfer (qpay has no bank-transaction fingerprints), so
// `consumedKhaanTransactions` is only passed by transfer callers.
//
// LBL-5: the cache purge lives here (lib), NOT in packages/api/src/queries.
// The query layer returns a plain boolean; this boundary derives the affected
// product ids from the post-confirm payment info and purges. `purgeTagsGlobal`
// lazily resolves `cloudflare:workers`, so importing it here does not couple
// the queries package to the Worker runtime.

export type ConfirmPaymentSource =
	| "admin"
	| "auto_reconciliation"
	| "messenger"
	| "qpay_checkout"
	| "qpay_webhook";

export type ConfirmPaymentProvider = "transfer" | "qpay";

type ConfirmPaymentInput = {
	paymentNumber: string;
	provider: ConfirmPaymentProvider;
	source: ConfirmPaymentSource;
	referrer?: string;
	consumedKhaanTransactions?: { fingerprint: string }[];
};

export type ConfirmPaymentResult =
	| { confirmed: true; orderNumber?: string }
	| {
			confirmed: false;
			reason:
				| "already_confirmed_or_not_pending"
				| "khaan_transaction_already_consumed";
	  };

export async function confirmPaymentAndNotify({
	paymentNumber,
	provider,
	source,
	referrer,
	consumedKhaanTransactions,
}: ConfirmPaymentInput): Promise<ConfirmPaymentResult> {
	const q = paymentQueries.store;
	let confirmed: boolean;
	try {
		confirmed = await q.confirmPaymentAndApplyStock(
			paymentNumber,
			provider,
			consumedKhaanTransactions,
		);
	} catch (error) {
		if (error instanceof KhaanTransactionAlreadyConsumedError) {
			// Do NOT surface the fingerprint hash to any caller/UI. The hash is
			// logged server-side only; the result carries a clean reason so the
			// admin/manual-review path can present "bank transaction already
			// used by another order" without leaking the fingerprint (F1).
			console.error(
				`[khaan] ${source} confirm ABORTED — bank transaction already consumed (paymentNumber=${paymentNumber}); routing to manual review`,
			);
			return {
				confirmed: false,
				reason: "khaan_transaction_already_consumed",
			};
		}
		throw error;
	}

	if (!confirmed) {
		return { confirmed: false, reason: "already_confirmed_or_not_pending" };
	}

	const paymentInfo = await q.getPaymentInfoByNumber(paymentNumber);
	if (!paymentInfo) {
		return { confirmed: true };
	}

	// Purge storefront product cache for the affected products. The product ids
	// come from the post-confirm payment info (every order detail was stocked
	// on a successful confirm). Purging a few extra tags is harmless; missing
	// one would leave a stale price/stock on the storefront.
	const stockedProductIds = paymentInfo.order.orderDetails.map(
		(detail) => detail.product.id,
	);
	await purgeTagsGlobal([
		PRODUCTS_TAG,
		...stockedProductIds.map((id) => productTag(id)),
	]);

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

	await sendOrderConfirmationSms({
		paymentNumber,
		orderNumber: paymentInfo.order.orderNumber,
		customerPhone: paymentInfo.order.customerPhone,
		total: paymentInfo.order.total,
	});

	trackPaymentConfirmedServerSide({
		phone: paymentInfo.order.customerPhone?.toString() ?? paymentNumber,
		paymentNumber,
		orderNumber: paymentInfo.order.orderNumber,
		provider,
		revenue: paymentInfo.order.total,
		referrer,
	}).catch(() => {});
	trackOrderPlacedServerSide({
		phone: paymentInfo.order.customerPhone?.toString() ?? paymentNumber,
		orderNumber: paymentInfo.order.orderNumber,
		paymentNumber,
		total: paymentInfo.order.total,
		provider,
	}).catch(() => {});

	return {
		confirmed: true,
		orderNumber: paymentInfo.order.orderNumber,
	};
}
