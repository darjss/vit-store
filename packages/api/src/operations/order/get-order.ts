import type { OrderAccessError, OrderTracking } from "@vit/shared";
import type { Result as ResultType } from "better-result";
import type { Context } from "~/lib/context";
import { getOrderAccess } from "~/lib/session/checkout-access";
import type { orderQueries } from "~/queries/orders";

type OrderRecord = NonNullable<
	Awaited<ReturnType<typeof orderQueries.store.getOrderByOrderNumber>>
>;

export type OrderAccessValue = {
	legacy: OrderRecord;
	public: OrderTracking;
};

const toOrderTracking = (order: OrderRecord): OrderTracking => ({
	id: order.id,
	orderNumber: order.orderNumber,
	customerPhone: order.customerPhone,
	status: order.status,
	total: order.total,
	notes: order.notes,
	address: order.address,
	deliveryProvider: order.deliveryProvider,
	createdAt: order.createdAt,
	updatedAt: order.updatedAt,
	payments: order.payments.map((payment) => ({
		paymentNumber: payment.paymentNumber,
		status: payment.status,
		provider: payment.provider,
		createdAt: payment.createdAt,
	})),
	orderDetails: order.orderDetails.map((detail) => ({
		quantity: detail.quantity,
		product: {
			id: detail.product.id,
			name: detail.product.name,
			price: detail.product.price,
			brand: { name: detail.product.brand.name },
			images: detail.product.images.map((image) => ({ url: image.url })),
		},
	})),
});

export const getOrder = async (
	ctx: Context,
	input: { orderNumber: string; checkoutToken?: string },
): Promise<ResultType<OrderAccessValue, OrderAccessError>> =>
	(await getOrderAccess(ctx, input.orderNumber, input.checkoutToken)).map(
		(order) => ({ legacy: order, public: toOrderTracking(order) }),
	);
