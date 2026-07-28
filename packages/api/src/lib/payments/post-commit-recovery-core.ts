import { matchAsync } from "dismatch/async";

export type PaymentRecoveryEffect =
	| "cache_purge"
	| "messenger_notification"
	| "analytics";

export type PaymentRecoveryData = {
	paymentNumber: string;
	customerPhone: number;
	orderNumber: string;
	total: number;
	address: string;
	notes: string | null;
	productIds: number[];
	products: Array<{
		name: string;
		quantity: number;
		price: number;
		imageUrl?: string;
	}>;
};

export type PaymentRecoveryNotification = {
	paymentNumber: string;
	customerPhone: number;
	address: string;
	notes: string | null;
	total: number;
	products: PaymentRecoveryData["products"];
	status: "payment_confirmed";
};

type Effect =
	| { _tag: "cache_purge" }
	| { _tag: "messenger_notification" }
	| { _tag: "analytics" };

export type PostCommitRecoveryDependencies = {
	loadPayment: (
		paymentNumber: string,
	) => Promise<PaymentRecoveryData | undefined>;
	purgeCache: (productIds: number[]) => Promise<boolean>;
	sendMessenger: (payload: PaymentRecoveryNotification) => Promise<void>;
	trackAnalytics: (
		payment: PaymentRecoveryData,
		provider: "transfer" | "qpay",
		referrer?: string,
	) => Promise<boolean>;
	claim: (
		paymentNumber: string,
		effect: PaymentRecoveryEffect,
	) => Promise<string | null>;
	mark: (
		paymentNumber: string,
		effect: PaymentRecoveryEffect,
		claimToken: string,
		status: "completed" | "ambiguous" | "pending",
		errorCode?: string,
	) => Promise<void>;
	persistMessengerFailure: (
		paymentNumber: string,
		payload: PaymentRecoveryNotification,
		error: unknown,
	) => Promise<void>;
};

const notification = (
	payment: PaymentRecoveryData,
): PaymentRecoveryNotification => ({
	paymentNumber: payment.paymentNumber,
	customerPhone: payment.customerPhone,
	address: payment.address,
	notes: payment.notes,
	total: payment.total,
	products: payment.products,
	status: "payment_confirmed",
});

const toEffect = (effect: PaymentRecoveryEffect): Effect => ({ _tag: effect });

export const runPostCommitRecoveryWithDependencies = async (
	input: {
		paymentNumber: string;
		provider: "transfer" | "qpay";
		referrer?: string;
		effects?: PaymentRecoveryEffect[];
	},
	dependencies: PostCommitRecoveryDependencies,
) => {
	const payment = await dependencies.loadPayment(input.paymentNumber);
	if (!payment) return { recoveryPending: true };
	const effects = input.effects ?? [
		"cache_purge",
		"messenger_notification",
		"analytics",
	];
	const outcomes = await Promise.allSettled(
		effects.map(async (effect) => {
			const claimToken = await dependencies.claim(input.paymentNumber, effect);
			if (!claimToken) return false;
			return matchAsync(
				toEffect(effect),
				"_tag",
			)<boolean>({
				cache_purge: async () => {
					const completed = await dependencies.purgeCache(payment.productIds);
					await dependencies.mark(
						input.paymentNumber,
						"cache_purge",
						claimToken,
						completed ? "completed" : "pending",
						completed ? undefined : "cache_purge_failed",
					);
					return completed;
				},
				messenger_notification: async () => {
					const payload = notification(payment);
					try {
						await dependencies.sendMessenger(payload);
						await dependencies.mark(
							input.paymentNumber,
							"messenger_notification",
							claimToken,
							"completed",
						);
						return true;
					} catch (error) {
						await Promise.allSettled([
							dependencies.mark(
								input.paymentNumber,
								"messenger_notification",
								claimToken,
								"ambiguous",
								"provider_ambiguous",
							),
							dependencies.persistMessengerFailure(
								input.paymentNumber,
								payload,
								error,
							),
						]);
						return false;
					}
				},
				analytics: async () => {
					const completed = await dependencies.trackAnalytics(
						payment,
						input.provider,
						input.referrer,
					);
					await dependencies.mark(
						input.paymentNumber,
						"analytics",
						claimToken,
						completed ? "completed" : "pending",
						completed ? undefined : "analytics_failed",
					);
					return completed;
				},
			});
		}),
	);
	return {
		recoveryPending: outcomes.some(
			(outcome) => outcome.status === "rejected" || outcome.value === false,
		),
	};
};
