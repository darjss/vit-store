import { orderStatus as orderStatusValues } from "@vit/shared/constants";
import type { OrderStatusType } from "@vit/shared/types";
import { picklist, safeParse } from "valibot";
import { orderStatusLabel } from "@/lib/enum-labels";

const orderStatusSchema = picklist(orderStatusValues);

export function normalizeOrderStatus(status: string): OrderStatusType | undefined {
	const normalized = status === "pendingOrders" ? "pending" : status;
	const parsed = safeParse(orderStatusSchema, normalized);
	return parsed.success ? parsed.output : undefined;
}

export function labelForOrderStatus(status: string): string {
	const normalized = normalizeOrderStatus(status);
	return normalized ? orderStatusLabel[normalized] : status;
}
