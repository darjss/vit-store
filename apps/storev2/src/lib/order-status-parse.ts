import type { OrderStatusType } from "@vit/shared/types";
import { picklist, safeParse } from "valibot";

export const orderStatusSchema = picklist([
	"created",
	"pending",
	"shipped",
	"delivered",
	"cancelled",
	"refunded",
] as const);

export function parseOrderStatus(
	wire: string,
	fallback: OrderStatusType = "pending",
): OrderStatusType {
	const parsed = safeParse(orderStatusSchema, wire);
	return parsed.success ? parsed.output : fallback;
}
