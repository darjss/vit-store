import * as v from "valibot";
import { orderStatus, paymentProvider, paymentStatus } from "../constants";
import { publicErrorSchema } from "./errors";

export const paymentErrorSchema = v.variant("_tag", [
	publicErrorSchema("PaymentNotFound", {
		message: v.literal("Төлбөрийн мэдээлэл олдсонгүй."),
	}),
	publicErrorSchema("PaymentAccessDenied", {
		message: v.literal("Энэ төлбөрийн мэдээллийг харах эрхгүй байна."),
	}),
	publicErrorSchema("PaymentAlreadyConfirmed", {
		message: v.literal("Төлбөр аль хэдийн баталгаажсан байна."),
		orderNumber: v.optional(v.string()),
	}),
	publicErrorSchema("PaymentNotPending", {
		message: v.literal("Энэ төлбөр одоо хүлээгдэж буй төлөвт биш байна."),
		status: v.picklist(paymentStatus),
	}),
	publicErrorSchema("PaymentMethodMismatch", {
		message: v.literal("Сонгосон төлбөрийн хэлбэр тохирохгүй байна."),
		expected: v.picklist(paymentProvider),
		actual: v.picklist(paymentProvider),
	}),
	publicErrorSchema("PaymentProviderUnavailable", {
		message: v.literal("Төлбөрийн үйлчилгээтэй холбогдож чадсангүй."),
		provider: v.picklist(["qpay", "khaan"]),
		retryable: v.boolean(),
		fallbackMethods: v.array(v.picklist(paymentProvider)),
	}),
	publicErrorSchema("PaymentConfirmationConflict", {
		message: v.literal("Төлбөрийг одоогоор баталгаажуулж чадсангүй."),
		retryable: v.boolean(),
	}),
	publicErrorSchema("BankTransactionAlreadyConsumed", {
		message: v.literal("Банкны гүйлгээг өөр төлбөрт ашигласан байна."),
	}),
	publicErrorSchema("ManualReviewRequired", {
		message: v.literal("Төлбөрийг ажилтан гараар шалгах шаардлагатай байна."),
		paymentStatus: v.picklist(paymentStatus),
	}),
]);

const paymentProductSchema = v.strictObject({
	productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
	name: v.string(),
	price: v.pipe(v.number(), v.integer(), v.minValue(0)),
	quantity: v.pipe(v.number(), v.integer(), v.minValue(1)),
	imageUrl: v.optional(v.string()),
});

export const paymentDetailsSchema = v.strictObject({
	paymentNumber: v.string(),
	status: v.picklist(paymentStatus),
	provider: v.picklist(paymentProvider),
	createdAt: v.date(),
	total: v.pipe(v.number(), v.integer(), v.minValue(0)),
	transferAccount: v.strictObject({
		bankName: v.string(),
		accountNumber: v.string(),
		accountName: v.string(),
	}),
	order: v.strictObject({
		orderNumber: v.string(),
		customerPhone: v.string(),
		status: v.picklist(orderStatus),
		address: v.string(),
		notes: v.nullable(v.string()),
		createdAt: v.date(),
		products: v.array(paymentProductSchema),
	}),
});

export const paymentStatusSchema = v.strictObject({
	status: v.picklist(paymentStatus),
	provider: v.picklist(paymentProvider),
});

export const transferClaimSchema = v.strictObject({
	orderNumber: v.string(),
	outcome: v.picklist([
		"changed",
		"already_claimed",
		"already_confirmed",
		"refused",
	]),
});

export const selectTransferSchema = v.strictObject({
	provider: v.literal("transfer"),
});

const qpayUrlSchema = v.strictObject({
	name: v.string(),
	description: v.string(),
	logo: v.string(),
	link: v.string(),
});

export const qpayInvoiceSchema = v.strictObject({
	invoice_id: v.string(),
	qr_text: v.string(),
	qr_image: v.string(),
	qPay_shortUrl: v.string(),
	urls: v.array(qpayUrlSchema),
});

export const qpayCheckSchema = v.strictObject({
	paid: v.boolean(),
	orderNumber: v.optional(v.string()),
});

export const transferReconciliationStatus = [
	"polling",
	"matched",
	"confirmed",
	"timeout",
	"auth_required",
	"ambiguous",
	"failed",
] as const;

export const transferReconciliationSchema = v.strictObject({
	paymentNumber: v.string(),
	status: v.picklist(transferReconciliationStatus),
	attempts: v.pipe(v.number(), v.integer(), v.minValue(0)),
	startedAt: v.string(),
	expiresAt: v.string(),
	nextPollAt: v.nullable(v.string()),
	lastError: v.nullable(
		v.picklist([
			"payment_not_found",
			"payment_not_confirmable",
			"auth_required",
			"rate_limited",
			"provider_unavailable",
			"bank_transaction_already_consumed",
			"confirmation_conflict",
		]),
	),
});

export const nullableTransferReconciliationSchema = v.nullable(
	transferReconciliationSchema,
);

export type PaymentError = v.InferOutput<typeof paymentErrorSchema>;
export type PaymentDetails = v.InferOutput<typeof paymentDetailsSchema>;
export type PaymentStatus = v.InferOutput<typeof paymentStatusSchema>;
export type TransferClaim = v.InferOutput<typeof transferClaimSchema>;
export type QpayInvoice = v.InferOutput<typeof qpayInvoiceSchema>;
export type TransferReconciliation = v.InferOutput<
	typeof transferReconciliationSchema
>;
