import {
	checkoutCreatedSchema,
	checkoutErrorSchema,
	newOrderSchema,
	orderAccessErrorSchema,
	orderTrackingSchema,
	type CheckoutError,
} from "@vit/shared";
import { match } from "dismatch";
import * as v from "valibot";
import { createCheckoutOrder } from "~/operations/checkout";
import { getOrder } from "~/operations/order";
import { type LegacyTrpcError, toLegacyTrpc } from "~/result/legacy-trpc";
import { serializeResult } from "@vit/shared";
import { getDeliveryAddressZones } from "~/lib/integrations/delivery";
import { publicProcedure, router, verifiedCustomerProcedure } from "~/lib/trpc";
import { orderQueries } from "~/queries/orders";

const checkoutLegacyError = (error: CheckoutError) =>
	match(
		error,
		"_tag",
	)<LegacyTrpcError>({
		CartEmpty: () => ({
			code: "BAD_REQUEST" as const,
			message: "Сагс хоосон эсвэл буруу байна. Дахин оролдоно уу.",
		}),
		CartChanged: ({ message }) => ({ code: "BAD_REQUEST" as const, message }),
		InvalidCheckoutDetails: ({ message }) => ({
			code: "BAD_REQUEST" as const,
			message,
		}),
		ProductUnavailable: ({ productName }) => ({
			code: "BAD_REQUEST" as const,
			message: productName
				? `${productName} үлдэгдэл хүрэлцэхгүй байна.`
				: "Зарим бараа олдсонгүй. Сагсаа шинэчлээд дахин оролдоно уу.",
		}),
		InsufficientStock: ({ items }) => ({
			code: "BAD_REQUEST" as const,
			message: `${items[0]?.productName ?? "Бараа"} үлдэгдэл хүрэлцэхгүй байна.`,
		}),
		DeliveryUnavailable: ({ message }) => ({
			code: "SERVICE_UNAVAILABLE" as const,
			message,
		}),
		CheckoutKeyConflict: ({ message }) => ({
			code: "CONFLICT" as const,
			message,
		}),
		CheckoutRecoveryRequired: ({ message }) => ({
			code: "CONFLICT" as const,
			message,
		}),
	});

const orderInputSchema = v.object({
	orderNumber: v.string(),
	checkoutToken: v.optional(v.string()),
});

const getCustomerOrders = verifiedCustomerProcedure.query(async ({ ctx }) => {
	const customerPhone = ctx.session.user.phone;
	const orders =
		await orderQueries.store.getOrdersByCustomerPhone(customerPhone);
	return orders.map((order) => {
		const { orderDetails, sales, ...orderInfo } = order;
		const salesPriceMap = new Map(
			sales.map((sale) => [sale.productId, sale.sellingPrice]),
		);
		return {
			...orderInfo,
			products: orderDetails.map((detail) => ({
				name: detail.product.name,
				brandName: detail.product.brand.name,
				imageUrl: detail.product.images[0]?.url,
				quantity: detail.quantity,
				sellingPrice: salesPriceMap.get(detail.productId) ?? 0,
			})),
		};
	});
});

export const order = router({
	getOrdersByCustomerId: getCustomerOrders,
	addOrder: publicProcedure
		.input(newOrderSchema)
		.mutation(async ({ input, ctx }) =>
			toLegacyTrpc(await createCheckoutOrder(ctx, input), checkoutLegacyError),
		),
	getOrderByOrderNumber: publicProcedure
		.input(orderInputSchema)
		.query(async ({ input, ctx }) =>
			toLegacyTrpc(
				(await getOrder(ctx, input)).map((value) => value.legacy),
				(error) => ({
					code: error._tag === "OrderNotFound" ? "NOT_FOUND" : "UNAUTHORIZED",
					message:
						error._tag === "OrderNotFound"
							? "Захиалга олдсонгүй"
							: "Захиалгын мэдээлэл харах эрхгүй",
				}),
			),
		),
	getDeliveryAddressZones: publicProcedure.query(() =>
		getDeliveryAddressZones(),
	),
});

export const orderV2 = router({
	addOrder: publicProcedure
		.input(newOrderSchema)
		.mutation(async ({ input, ctx }) =>
			serializeResult(await createCheckoutOrder(ctx, input), {
				value: checkoutCreatedSchema,
				error: checkoutErrorSchema,
			}),
		),
	getOrderByOrderNumber: publicProcedure
		.input(orderInputSchema)
		.query(async ({ input, ctx }) =>
			serializeResult(
				(await getOrder(ctx, input)).map((value) => value.public),
				{
					value: orderTrackingSchema,
					error: orderAccessErrorSchema,
				},
			),
		),
});
