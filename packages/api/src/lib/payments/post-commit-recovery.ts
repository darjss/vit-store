import { purgeCatalogCacheGlobal } from "~/lib/cache/workers-cache";
import { persistMessengerNotificationFailure } from "~/lib/integrations/messenger/failed-notifications";
import { sendDetailedOrderNotification } from "~/lib/integrations/messenger/messages";
import {
	trackOrderPlacedServerSide,
	trackPaymentConfirmedServerSide,
} from "~/lib/integrations/posthog";
import { paymentQueries } from "~/queries/payments";
import {
	type PaymentRecoveryData,
	type PostCommitRecoveryDependencies,
	runPostCommitRecoveryWithDependencies,
} from "./post-commit-recovery-core";

const loadPayment = async (
	paymentNumber: string,
): Promise<PaymentRecoveryData | undefined> => {
	const payment =
		await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
	if (!payment) return undefined;
	return {
		paymentNumber: payment.paymentNumber,
		customerPhone: payment.order.customerPhone,
		orderNumber: payment.order.orderNumber,
		total: payment.order.total,
		address: payment.order.address,
		notes: payment.order.notes,
		productIds: payment.order.orderDetails.map((detail) => detail.product.id),
		products: payment.order.orderDetails.map((detail) => ({
			name: detail.product.name,
			quantity: detail.quantity,
			price: detail.product.price,
			imageUrl: detail.product.images[0]?.url,
		})),
	};
};

const defaultDependencies: PostCommitRecoveryDependencies = {
	loadPayment,
	purgeCache: (productIds) => purgeCatalogCacheGlobal(productIds),
	sendMessenger: sendDetailedOrderNotification,
	trackAnalytics: async (payment, provider, referrer) => {
		const phone = payment.customerPhone.toString();
		const outcomes = await Promise.all([
			trackPaymentConfirmedServerSide({
				phone,
				paymentNumber: payment.paymentNumber,
				orderNumber: payment.orderNumber,
				provider,
				revenue: payment.total,
				referrer,
			}),
			trackOrderPlacedServerSide({
				phone,
				orderNumber: payment.orderNumber,
				paymentNumber: payment.paymentNumber,
				total: payment.total,
				provider,
			}),
		]);
		return outcomes.every(Boolean);
	},
	claim: paymentQueries.store.claimPostCommitRecovery,
	mark: paymentQueries.store.markPostCommitRecovery,
	persistMessengerFailure: async (paymentNumber, payload, error) => {
		await persistMessengerNotificationFailure({
			paymentNumber,
			payload,
			error,
		});
	},
};

export const runPaymentPostCommitRecovery = (
	input: Parameters<typeof runPostCommitRecoveryWithDependencies>[0],
) => runPostCommitRecoveryWithDependencies(input, defaultDependencies);

export const retryPendingPaymentPostCommitRecovery = async () => {
	const pending = await paymentQueries.store.getPendingPostCommitRecovery();
	for (const job of pending) {
		const payment = await paymentQueries.store.getPaymentInfoByNumber(
			job.paymentNumber,
		);
		if (!payment) continue;
		await runPaymentPostCommitRecovery({
			paymentNumber: job.paymentNumber,
			provider: payment.provider === "qpay" ? "qpay" : "transfer",
			effects: [job.effect],
		});
	}
	return { processedCount: pending.length };
};

export { runPostCommitRecoveryWithDependencies } from "./post-commit-recovery-core";
