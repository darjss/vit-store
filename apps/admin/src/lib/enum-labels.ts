import { orderStatusLabels } from "@vit/shared";
import type {
	purchaseStatus,
	status as productStatus,
} from "@vit/shared/constants";
import type {
	OrderStatusType,
	PaymentProviderType,
	PaymentStatusType,
} from "@vit/shared/types";

type ProductStatusType = (typeof productStatus)[number];
type PurchaseStatusType = (typeof purchaseStatus)[number];

export const orderStatusLabel: Record<OrderStatusType, string> =
	orderStatusLabels;

export const paymentStatusLabel: Record<PaymentStatusType, string> = {
	pending: "Хүлээгдэж буй",
	customer_claimed_paid: "Төлсөн гэж мэдэгдсэн",
	success: "Төлсөн",
	failed: "Амжилтгүй",
};

export const paymentProviderLabel: Record<PaymentProviderType, string> = {
	qpay: "QPay",
	transfer: "Данс",
	cash: "Бэлэн мөнгө",
};

export const productStatusLabel: Record<ProductStatusType, string> = {
	active: "Идэвхтэй",
	draft: "Ноорог",
	out_of_stock: "Дууссан",
};

export const purchaseStatusLabel: Record<PurchaseStatusType, string> = {
	draft: "Ноорог",
	ordered: "Захиалсан",
	shipped: "Илгээгдсэн",
	forwarder_received: "Зуучлагч хүлээн авсан",
	partially_received: "Хэсэгчлэн хүлээн авсан",
	received: "Хүлээн авсан",
	cancelled: "Цуцлагдсан",
};
