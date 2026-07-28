import type { PaymentError, PaymentStatusType } from "@vit/shared";
import { match } from "dismatch";

const states = {
	pending: { _tag: "pending" },
	customer_claimed_paid: { _tag: "customer_claimed_paid" },
	success: { _tag: "success" },
	failed: { _tag: "failed" },
} as const satisfies Record<PaymentStatusType, { _tag: PaymentStatusType }>;

export const paymentStateAction = (status: PaymentStatusType) =>
	match(
		states[status],
		"_tag",
	)<"pending" | "confirmed" | "failed">({
		pending: () => "pending",
		customer_claimed_paid: () => "pending",
		success: () => "confirmed",
		failed: () => "failed",
	});

const actions = {
	pending: { _tag: "pending" },
	confirmed: { _tag: "confirmed" },
	failed: { _tag: "failed" },
} as const satisfies Record<
	ReturnType<typeof paymentStateAction>,
	{ _tag: ReturnType<typeof paymentStateAction> }
>;

export const pendingPaymentError = (
	status: PaymentStatusType,
	orderNumber?: string,
) =>
	match(
		actions[paymentStateAction(status)],
		"_tag",
	)<PaymentError | null>({
		pending: () => null,
		confirmed: () => ({
			_tag: "PaymentAlreadyConfirmed",
			message: "Төлбөр аль хэдийн баталгаажсан байна.",
			orderNumber,
		}),
		failed: () => ({
			_tag: "PaymentNotPending",
			message: "Энэ төлбөр одоо хүлээгдэж буй төлөвт биш байна.",
			status,
		}),
	});
