import path from "node:path";
import { config as loadDotEnv } from "dotenv";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { createDb } from "@vit/api/db";
import { OrdersTable, PaymentsTable, ProductImagesTable } from "@vit/api/db/schema";
import { sendDetailedOrderNotification } from "@vit/api/lib/integrations/admin-notifications/send";
import { projectOrderResult } from "@vit/api/lib/utils";

// One-off: re-send today's latest order notification to a single admin chat.
// Usage: bun scripts/resend-order-notification.ts [chatId]

loadDotEnv({ path: path.resolve(import.meta.dir, "../../../.env.prod") });

const chatId = process.argv[2] ?? "8032101387";
process.env.TELEGRAM_ADMIN_CHAT_ID = chatId;

const connStr = `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`;
const db = createDb(connStr);

const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

const result = await db.query.OrdersTable.findFirst({
	orderBy: [desc(OrdersTable.createdAt)],
	where: and(isNull(OrdersTable.deletedAt), gte(OrdersTable.createdAt, todayStart)),
	with: {
		orderDetails: {
			columns: { price: true, quantity: true },
			with: {
				product: {
					columns: { id: true, name: true, price: true },
					with: {
						images: {
							columns: { url: true },
							where: and(
								eq(ProductImagesTable.isPrimary, true),
								isNull(ProductImagesTable.deletedAt),
							),
						},
					},
				},
			},
		},
		payments: {
			columns: {
				createdAt: true,
				paymentNumber: true,
				provider: true,
				status: true,
			},
			where: isNull(PaymentsTable.deletedAt),
		},
	},
});

if (!result) {
	throw new Error(`no orders since ${todayStart.toISOString()}`);
}

const order = projectOrderResult(result);
console.log(
	`latest order today: ${order.orderNumber} (${order.createdAt.toISOString()}) -> chat ${chatId}`,
);

await sendDetailedOrderNotification({
	address: order.address,
	customerPhone: Number(order.customerPhone),
	notes: order.notes,
	orderNumber: order.orderNumber,
	paymentNumber: order.paymentNumber ?? "",
	products: order.products.map((p) => ({
		imageUrl: p.imageUrl,
		name: p.name,
		price: p.price,
		quantity: p.quantity,
	})),
	provider: order.paymentProvider,
	total: order.total,
});

console.log("sent");
process.exit(0);
