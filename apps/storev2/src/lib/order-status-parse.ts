import type { OrderStatusType } from "@vit/shared/types";
import * as v from "valibot";

export const orderStatusSchema = v.picklist([
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
	const parsed = v.safeParse(orderStatusSchema, wire);
	return parsed.success ? parsed.output : fallback;
}
