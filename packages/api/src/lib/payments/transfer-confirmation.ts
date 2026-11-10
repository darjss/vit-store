import { purgeCatalogCacheGlobal } from "~/lib/cache/workers-cache";
import { parseCaught } from "~/lib/logging";
import { persistMessengerNotificationFailure } from "~/lib/integrations/messenger/failed-notifications";
import {
	type DetailedOrderNotificationInput,
	sendDetailedOrderNotification,
} from "~/lib/integrations/admin-notifications";
import { trackPaymentConfirmedServerSide } from "~/lib/integrations/posthog";
import { KhaanTransactionAlreadyConsumedError } from "~/lib/payments/consumed-transaction";
import { paymentQueries } from "~/queries/payments";

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
// product ids from the post-confirm payment info and purges.
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
	consumedKhaanTransactions?: Array<{ fingerprint: string }>;
	paymentNumber: string;
	provider: ConfirmPaymentProvider;
	source: ConfirmPaymentSource;
};

export type ConfirmPaymentResult =
	| { confirmed: true; orderNumber?: string }
	| {
			confirmed: false;
			reason: "already_confirmed_or_not_pending" | "khaan_transaction_already_consumed";
	  };

/**
 * Admin paths that write a successful Payment directly (order create, order
 * edit, manual payment create) bypass confirmPaymentAndNotify, so they report
 * it here. Reads the row back so the event matches the other confirm paths.
 */
export async function trackAdminConfirmedPayment(paymentNumber: string) {
	const payment = await paymentQueries.store
		.getPaymentInfoByNumber(paymentNumber)
		.catch(() => null);
	if (payment) {
		trackPaymentConfirmedServerSide(payment, "admin");
	}
}

export async function confirmPaymentAndNotify({
	consumedKhaanTransactions,
	paymentNumber,
	provider,
	source,
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
	const stockedProductIds = paymentInfo.order.orderDetails.map((detail) => detail.product.id);
	await purgeCatalogCacheGlobal(stockedProductIds);

	const notificationPayload: DetailedOrderNotificationInput = {
		address: paymentInfo.order.address,
		customerPhone: paymentInfo.order.customerPhone,
		notes: paymentInfo.order.notes,
		orderNumber: paymentInfo.order.orderNumber,
		paymentNumber,
		products: paymentInfo.order.orderDetails.map((detail) => ({
			imageUrl: detail.product.images[0]?.url,
			name: detail.product.name,
			price: detail.product.price,
			quantity: detail.quantity,
		})),
		provider,
		total: paymentInfo.order.total,
	};

	try {
		await sendDetailedOrderNotification(notificationPayload);
	} catch (notificationError) {
		try {
			await persistMessengerNotificationFailure({
				error: parseCaught(notificationError),
				payload: notificationPayload,
				paymentNumber,
			});
		} catch {
			// Payment confirmation has already succeeded; notification storage must not roll it back.
		}
	}

	trackPaymentConfirmedServerSide(paymentInfo, source);

	return {
		confirmed: true,
		orderNumber: paymentInfo.order.orderNumber,
	};
}
