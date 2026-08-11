import { Badge } from "@vit/ui";
import { createMemo } from "solid-js";
import { Dynamic } from "solid-js/web";

import {
	displayStatus,
	PRODUCT_STATUS_META,
	type ProductStatus,
} from "../types";

/**
 * Status pill — text + icon, never colour alone (design rule). Follows the
 * legacy rule: zero stock reads as out of stock even when status is active.
 */
export function ProductStatusBadge(props: {
	status: ProductStatus;
	stock?: number;
}) {
	const meta = createMemo(
		() => PRODUCT_STATUS_META[displayStatus(props.status, props.stock ?? 0)],
	);
	return (
		<Badge tone={meta().tone} icon={<Dynamic component={meta().icon} />}>
			{meta().label}
		</Badge>
	);
}
