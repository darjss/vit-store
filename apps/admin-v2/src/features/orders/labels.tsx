/*
 * Order feature vocabulary and presentation meta.
 *
 * Labels come from the approved variant-B prototype (plans/admin-v2-ui-prototype/
 * index.html): created=Шинэ, pending=Бэлтгэсэн, shipped=Хүргэлтэд,
 * delivered=Хүргэгдсэн, cancelled=Цуцалсан, refunded=Буцаалт. Tones reuse the
 * approved status palette (lemon / apricot / lavender / gray / coral) — no blue,
 * no green — and every badge renders text + icon, never colour alone.
 */
import { BoxIcon } from "@solar-icons/solid/linear/box";
import { CheckCircleIcon } from "@solar-icons/solid/linear/check-circle";
import { CheckReadIcon } from "@solar-icons/solid/linear/check-read";
import { ClockCircleIcon } from "@solar-icons/solid/linear/clock-circle";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import { DangerCircleIcon } from "@solar-icons/solid/linear/danger-circle";
import { DeliveryIcon } from "@solar-icons/solid/linear/delivery";
import type { BadgeProps } from "@vit/ui";
import type {
	OrderDeliveryProviderType,
	OrderStatusType,
	PaymentProviderType,
	PaymentStatusType,
} from "@vit/shared/types";
import type { JSX } from "solid-js";

export interface StatusMeta {
	label: string;
	tone: BadgeProps["tone"];
	icon: () => JSX.Element;
}

export const ORDER_STATUS_META: Record<OrderStatusType, StatusMeta> = {
	created: { label: "Шинэ", tone: "lemon", icon: () => <ClockCircleIcon /> },
	pending: { label: "Бэлтгэсэн", tone: "apricot", icon: () => <BoxIcon /> },
	shipped: {
		label: "Хүргэлтэд",
		tone: "lavender",
		icon: () => <DeliveryIcon />,
	},
	delivered: {
		label: "Хүргэгдсэн",
		tone: "gray",
		icon: () => <CheckReadIcon />,
	},
	cancelled: {
		label: "Цуцалсан",
		tone: "coral",
		icon: () => <CloseCircleIcon />,
	},
	refunded: {
		label: "Буцаалт",
		tone: "coral",
		icon: () => <CloseCircleIcon />,
	},
};

export const PAYMENT_STATUS_META: Record<PaymentStatusType, StatusMeta> = {
	pending: {
		label: "Хүлээгдэж буй",
		tone: "apricot",
		icon: () => <ClockCircleIcon />,
	},
	customer_claimed_paid: {
		label: "Батлах шаардлагатай",
		tone: "outline",
		icon: () => <DangerCircleIcon />,
	},
	success: {
		label: "Төлсөн",
		tone: "lavender",
		icon: () => <CheckCircleIcon />,
	},
	failed: {
		label: "Амжилтгүй",
		tone: "coral",
		icon: () => <CloseCircleIcon />,
	},
};

export const PAYMENT_PROVIDER_LABEL: Record<PaymentProviderType, string> = {
	qpay: "QPay",
	transfer: "Данс",
	cash: "Бэлэн мөнгө",
};

export function deliveryProviderLabel(
	provider?: OrderDeliveryProviderType | null,
): string {
	switch (provider) {
		case "tu-delivery":
			return "TU delivery";
		case "self":
			return "Өөрсдөө хүргэнэ";
		case "avidaa":
			return "Avidaa";
		case "pick-up":
			return "Өөрөө авна";
		default:
			return "Тодорхойгүй";
	}
}

/**
 * The single primary contextual action per order status, following the legal
 * transition graph in plans/admin-v2-contracts.md §3.3:
 *   created → pending ("Бэлтгэж эхлэх")
 *   pending → shipped (ship dialog — needs a delivery zone)
 *   shipped → delivered ("Хүргэгдсэн")
 *   delivered / cancelled / refunded → no primary action (read-only)
 * Cancellation lives in the ••• menu (legal until delivery).
 */
export const ORDER_PRIMARY_ACTION: Record<
	OrderStatusType,
	{ label: string; nextStatus?: "pending" | "delivered" } | null
> = {
	created: { label: "Бэлтгэж эхлэх", nextStatus: "pending" },
	pending: { label: "Илгээх" },
	shipped: { label: "Хүргэгдсэн", nextStatus: "delivered" },
	delivered: null,
	cancelled: null,
	refunded: null,
};

/** Statuses that may still be cancelled (cancellation is legal until delivery). */
export const CANCELLABLE_STATUSES: ReadonlySet<OrderStatusType> = new Set([
	"created",
	"pending",
	"shipped",
]);

export const ORDER_STATUS_VALUES: readonly OrderStatusType[] = [
	"created",
	"pending",
	"shipped",
	"delivered",
	"cancelled",
	"refunded",
];

export const mnt = (value: number) =>
	`${new Intl.NumberFormat("mn-MN").format(value)}₮`;

/** Relative date for cards: today/yesterday with time, older dates as month+day. */
export function whenText(value: Date | string): string {
	const date = typeof value === "string" ? new Date(value) : value;
	const now = new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const dayStart = new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	);
	const days = Math.round(
		(todayStart.getTime() - dayStart.getTime()) / 86_400_000,
	);
	const time = date.toLocaleTimeString("mn-MN", {
		hour: "2-digit",
		minute: "2-digit",
	});
	if (days < 1) return `өнөөдөр ${time}`;
	if (days === 1) return `өчигдөр ${time}`;
	return date.toLocaleDateString("mn-MN", { month: "short", day: "numeric" });
}

export function dateTimeText(value: Date | string): string {
	const date = typeof value === "string" ? new Date(value) : value;
	return date.toLocaleString("mn-MN");
}
