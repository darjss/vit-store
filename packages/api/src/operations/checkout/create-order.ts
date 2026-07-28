import type { newOrderType } from "@vit/shared";
import { bankTransfer } from "@vit/shared/constants";
import type { Context, CustomerSelectType } from "~/lib/context";
import {
	ORDER_CREATED_PURPOSE,
	persistMessengerNotificationFailure,
} from "~/lib/integrations/messenger/failed-notifications";
import { sendDetailedOrderNotification } from "~/lib/integrations/messenger/messages";
import { trackOrderCreatedServerSide } from "~/lib/integrations/posthog";
import { ensureQpayInvoiceForPayment } from "~/lib/payments/qpay-invoice";
import {
	createCheckoutAccessToken,
	type CustomerSessionClaims,
} from "~/lib/session/checkout-access";
import { createSession, setSessionTokenCookie } from "~/lib/session/store";
import { generateOrderNumber, generatePaymentNumber } from "~/lib/utils";
import { checkoutQueries, type CheckoutRecord } from "~/queries/checkout";
import { paymentQueries } from "~/queries/payments";
import {
	type CheckoutOperationDependencies,
	executeCheckout,
	type NormalizedCheckout,
} from "./core";

const notificationPayload = async (paymentNumber: string) => {
	const payment =
		await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
	if (!payment) return null;
	return {
		paymentNumber,
		customerPhone: payment.order.customerPhone,
		address: payment.order.address,
		notes: payment.order.notes,
		total: payment.order.total,
		products: payment.order.orderDetails.map((detail) => ({
			name: detail.product.name,
			quantity: detail.quantity,
			price: detail.product.price,
			imageUrl: detail.product.images[0]?.url,
		})),
		status: "pending_transfer" as const,
	};
};

const sendCheckoutNotification = async (
	ctx: Context,
	record: CheckoutRecord,
) => {
	const shouldSend = record.keyHash
		? record.notificationStatus === "pending" &&
			(await checkoutQueries.claimNotification(ctx.db, record.keyHash))
		: true;
	if (!shouldSend) return;

	const payload = await notificationPayload(record.paymentNumber);
	if (!payload) return;

	try {
		await sendDetailedOrderNotification(payload);
		if (record.keyHash) {
			await checkoutQueries.setNotificationStatus(
				ctx.db,
				record.keyHash,
				"completed",
			);
		}
	} catch (error) {
		if (record.keyHash) {
			await checkoutQueries
				.setNotificationStatus(ctx.db, record.keyHash, "ambiguous")
				.catch(() => undefined);
		}
		await persistMessengerNotificationFailure({
			paymentNumber: record.paymentNumber,
			payload,
			error,
			purpose: ORDER_CREATED_PURPOSE,
		}).catch(() => undefined);
	}
};

const runCheckoutPostCommit = async (
	ctx: Context,
	record: CheckoutRecord,
	input: NormalizedCheckout,
) => {
	await sendCheckoutNotification(ctx, record);
	ctx.c.executionCtx.waitUntil(
		ensureQpayInvoiceForPayment(record.paymentNumber).then((result) =>
			result.match({
				ok: () => undefined,
				err: (error) => {
					ctx.log.warn("checkout.qpay_precreate_incomplete", {
						paymentNumber: record.paymentNumber,
						error_tag: error._tag,
					});
				},
			}),
		),
	);
	ctx.c.executionCtx.waitUntil(
		trackOrderCreatedServerSide({
			phone: input.phoneNumber,
			orderNumber: record.orderNumber,
			paymentNumber: record.paymentNumber,
			itemCount: input.products.length,
			total: record.total,
			referrer: ctx.c.req.header("referer") ?? undefined,
		}),
	);
};

const createProductionDependencies = (
	ctx: Context,
): CheckoutOperationDependencies => ({
	findByKeyHash: (keyHash) => checkoutQueries.findByKeyHash(ctx.db, keyHash),
	getProducts: (productIds) => checkoutQueries.getProducts(ctx.db, productIds),
	commit: (input) => checkoutQueries.commit(ctx.db, input),
	generateOrderNumber,
	generatePaymentNumber,
	accountNumber: ctx.c.env.KHAAN_ACCOUNT_NUMBER || bankTransfer.accountNumber,
	accountName: ctx.c.env.KHAAN_ACCOUNT_NAME || bankTransfer.accountName,
	createAccess: async (record, input) => {
		const checkoutToken = await createCheckoutAccessToken(ctx, {
			orderId: record.orderId,
			orderNumber: record.orderNumber,
			paymentNumber: record.paymentNumber,
			phone: Number(input.phoneNumber),
		});
		const guest = {
			...record.customer,
			trust: "checkout_guest" as const,
			checkout: {
				orderId: record.orderId,
				orderNumber: record.orderNumber,
				paymentNumber: record.paymentNumber,
			},
		} satisfies CustomerSelectType & CustomerSessionClaims;
		const { session, token } = await createSession(guest, ctx.kv);
		setSessionTokenCookie(ctx.c, token, session.expiresAt);
		return checkoutToken;
	},
	runPostCommit: (record, input) => runCheckoutPostCommit(ctx, record, input),
});

export const createCheckoutOrder = (ctx: Context, input: newOrderType) =>
	executeCheckout(input, createProductionDependencies(ctx));
