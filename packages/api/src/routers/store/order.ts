import { TRPCError } from "@trpc/server";
import { adminQueries, storeQueries } from "@vit/api/queries";
import { newOrderSchema } from "../../../../shared/src";
import { customerProcedure, publicProcedure, router } from "../../lib/trpc";
import { generateOrderNumber, generatePaymentNumber } from "../../lib/utils";

export const order = router({
	getOrdersByCustomerId: customerProcedure.query(async ({ ctx }) => {
		try {
			const customerPhone = ctx.session.user.phone;
			const orders = await storeQueries.getOrdersByCustomerPhone(customerPhone);
			return orders.map((order) => {
				const { orderDetails, sales, ...orderInfo } = order;

				const salesPriceMap = new Map<number, number>();
				sales.forEach((sale) => {
					salesPriceMap.set(sale.productId, sale.sellingPrice);
				});
				const products = orderDetails.map((detail) => ({
					name: detail.product.name,
					brandName: detail.product.brand.name,
					imageUrl: detail.product.images[0]?.url,
					quantity: detail.quantity,
					sellingPrice: salesPriceMap.get(detail.productId) ?? 0,
				}));
				return {
					...orderInfo,
					products,
				};
			});
		} catch (e) {
			console.error(e);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch orders",
				cause: e,
			});
		}
	}),
	addOrder: publicProcedure
		.input(newOrderSchema)
		.mutation(async ({ input }) => {
			try {
				
				const products = await storeQueries.getProductsByIds(
					input.products.map((p) => p.productId),
				);
				const total = products.reduce((acc, p) => {
					const quantity = input.products.find(
						(p2) => p2.productId === p.id,
					)?.quantity;
					if (quantity) {
						return acc + p.price * quantity;
					}
					return acc;
				}, 0);
				const customer = await storeQueries.getCustomerByPhone(Number(input.phoneNumber));
				if (!customer) {
					await storeQueries.createCustomer({
						phone: Number(input.phoneNumber),
						address: input.address,
					});
				}
				await storeQueries.updateCustomerAddress(Number(input.phoneNumber), input.address);
				const order = await storeQueries.createOrder({
					orderNumber: generateOrderNumber(),
					customerPhone: Number(input.phoneNumber),
					address: input.address,
					notes: input.notes ?? null,
					total: total,
					status: "pending",
					deliveryProvider: "tu-delivery",
				});
				const orderId = order?.orderId;
				if (!orderId) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create order",
					});
				}
				await storeQueries.createOrderDetails(
					orderId,
					input.products.map((p) => ({
						productId: p.productId,
						quantity: p.quantity,
					})),
				);
				console.log("order created", orderId);
				let paymentNumber: string | null = null;
				try {
					const paymentResult = await adminQueries.createPayment({
						paymentNumber: generatePaymentNumber(),
						orderId: orderId,
						provider: "transfer",
						status: "pending",
						amount: total,
					});
					paymentNumber = paymentResult?.paymentNumber ?? null;
				} catch (e) {
					console.error(e);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create payment",
						cause: e,
					});
				}
				return { paymentNumber };
			} catch (e) {
				console.error(e);
			}
		}),
});
