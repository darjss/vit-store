import type { OrderStatusType } from "@vit/shared/types";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../../db";
import {
	OrderDetailsTable,
	OrdersTable,
	ProductImagesTable,
	ProductsTable,
} from "../../db/schema";

export function storeOrders(db: DB) {
	return {
	async getOrdersByCustomerPhone(phone: number) {
		const orders = await db.query.OrdersTable.findMany({
			where: and(
				eq(OrdersTable.customerPhone, phone),
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
		return orders;
	},

	async getProductsByIds(productIds: number[]) {
		const products = await db.query.ProductsTable.findMany({
			where: inArray(ProductsTable.id, productIds),
			columns: {
				id: true,
				name: true,
				price: true,
			},
		});
		return products;
	},

	async createOrder(data: {
		orderNumber: string;
		customerPhone: number;
		address: string;
		notes: string | null;
		total: number;
		status: OrderStatusType;
		deliveryProvider: string;
	}) {
		const result = await db
			.insert(OrdersTable)
			.values(data)
			.returning({ orderId: OrdersTable.id });
		return result[0];
	},

	async createOrderDetails(
		orderId: number,
		products: Array<{ productId: number; quantity: number }>,
	) {
		const values = products.map((p) => ({
			orderId,
			productId: p.productId,
			quantity: p.quantity,
		}));
		await db.insert(OrderDetailsTable).values(values);
	},
	async getOrderByOrderNumber(orderNumber: string) {
		const order = await db.query.OrdersTable.findFirst({
			where: eq(OrdersTable.orderNumber, orderNumber),
		});
		return order;
	},
	};
}
