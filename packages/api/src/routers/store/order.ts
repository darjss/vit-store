import { TRPCError } from "@trpc/server";
import {
	OrderDetailsTable,
	OrdersTable,
	ProductImagesTable,
	ProductsTable,
} from "@vit/api/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { newOrderSchema } from "../../../../shared/src";
import { customerProcedure, publicProcedure, router } from "../../lib/trpc";
import { generateOrderNumber } from "../../lib/utils";
import { createPayment } from "../admin/utils";

export const order = router({
	getOrdersByCustomerId: customerProcedure.query(async ({ ctx }) => {
		try {
			const customerPhone = ctx.session.user.phone;
			const orders = await ctx.db.query.OrdersTable.findMany({
				where: and(
					eq(OrdersTable.customerPhone, customerPhone),
					isNull(OrdersTable.deletedAt),
				),
				columns: {
					address: true,
					orderNumber: true,
					status: true,
					total: true,
					notes: true,
					createdAt: true,
				},
				with: {
					sales: {
						columns: {
							sellingPrice: true,
							productId: true,
						},
					},
					orderDetails: {
						columns: {
							productId: true,
							quantity: true,
						},
						with: {
							product: {
								columns: {
									name: true,
								},
								with: {
									brand: {
										columns: {
											name: true,
										},
									},
									images: {
										columns: {
											url: true,
										},
										where: eq(ProductImagesTable.isPrimary, true),
									},
								},
							},
						},
					},
				},
			});
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
		.mutation(async ({ ctx, input }) => {
			try {
				const products = await ctx.db.query.ProductsTable.findMany({
					where: inArray(
						ProductsTable.id,
						input.products.map((p) => p.productId),
					),
					columns: {
						id: true,
						name: true,
						price: true,
					},
				});
				const total = products.reduce((acc, p) => {
					const quantity = input.products.find(
						(p2) => p2.productId === p.id,
					)?.quantity;
					if (quantity) {
						return acc + p.price * quantity;
					}
					return acc;
				}, 0);
				const order = await ctx.db
					.insert(OrdersTable)
					.values({
						orderNumber: generateOrderNumber(),
						customerPhone: Number(input.phoneNumber),
						address: input.address,
						notes: input.notes,
						total: total,
						status: "pending",
						deliveryProvider: "tu-delivery",
					})
					.returning({ orderId: OrdersTable.id });
				const orderId = order?.[0]?.orderId;
				if (!orderId) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create order",
					});
				}
				for (const product of input.products) {
					await ctx.db.insert(OrderDetailsTable).values({
						orderId: orderId,
						productId: product.productId,
						quantity: product.quantity,
					});
				}
				let paymentId: number | undefined;
				try {
					const paymentResult = await createPayment(
						orderId,
						ctx,
						"pending",
						"transfer",
					);
					paymentId = paymentResult?.[0]?.id;
				} catch (e) {
					console.error(e);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create payment",
						cause: e,
					});
				}
				return { paymentId };
			} catch (e) {
				console.error(e);
			}
		}),
});
