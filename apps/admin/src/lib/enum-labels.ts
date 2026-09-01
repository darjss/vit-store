import { orderStatusLabels } from "@vit/shared";
import type { purchaseStatus, status as productStatus } from "@vit/shared/constants";
import type { OrderStatusType, PaymentProviderType, PaymentStatusType } from "@vit/shared/types";

type ProductStatusType = (typeof productStatus)[number];
type PurchaseStatusType = (typeof purchaseStatus)[number];

export const orderStatusLabel: Record<OrderStatusType, string> = orderStatusLabels;

export const paymentStatusLabel: Record<PaymentStatusType, string> = {
	customer_claimed_paid: "Шалгах шаардлагатай",
	failed: "Төлбөр амжилтгүй",
	pending: "Төлбөр хүлээж буй",
	success: "Төлбөр баталгаажсан",
};

export const paymentProviderLabel: Record<PaymentProviderType, string> = {
	cash: "Бэлэн мөнгө",
	qpay: "QPay",
	transfer: "Данс",
};

export const productStatusLabel: Record<ProductStatusType, string> = {
	active: "Идэвхтэй",
	draft: "Ноорог",
	out_of_stock: "Дууссан",
};

export const purchaseStatusLabel: Record<PurchaseStatusType, string> = {
	cancelled: "Цуцлагдсан",
	draft: "Ноорог",
	forwarder_received: "Зуучлагч хүлээн авсан",
	ordered: "Захиалсан",
	partially_received: "Хэсэгчлэн хүлээн авсан",
	received: "Хүлээн авсан",
	shipped: "Илгээгдсэн",
};
