/*
 * Status badges — text + icon, never colour alone (design rules).
 */
import { Badge } from "@vit/ui";
import type { OrderStatusType, PaymentStatusType } from "@vit/shared/types";

import { ORDER_STATUS_META, PAYMENT_STATUS_META } from "./labels";

export function OrderStatusBadge(props: { status: OrderStatusType }) {
	const meta = ORDER_STATUS_META[props.status];
	return (
		<Badge tone={meta.tone} icon={meta.icon()}>
			{meta.label}
		</Badge>
	);
}

export function PaymentStatusBadge(props: { status: PaymentStatusType }) {
	const meta = PAYMENT_STATUS_META[props.status];
	return (
		<Badge tone={meta.tone} icon={meta.icon()}>
			{meta.label}
		</Badge>
	);
}
