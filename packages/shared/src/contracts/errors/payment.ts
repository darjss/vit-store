import { paymentProvider, paymentStatus } from "../../constants";
import * as v from "valibot";
import { publicErrorSchema } from "../errors";

export const paymentErrorSchema = v.variant("_tag", [
	publicErrorSchema("PaymentNotFound", { message: v.string() }),
	publicErrorSchema("PaymentAccessDenied", { message: v.string() }),
	publicErrorSchema("PaymentAlreadyConfirmed", {
		orderNumber: v.optional(v.string()),
		message: v.string(),
	}),
	publicErrorSchema("PaymentNotPending", {
		status: v.picklist(paymentStatus),
		message: v.string(),
	}),
	publicErrorSchema("PaymentMethodMismatch", {
		expected: v.picklist(paymentProvider),
		actual: v.picklist(paymentProvider),
		message: v.string(),
	}),
	publicErrorSchema("PaymentProviderUnavailable", {
		provider: v.picklist(paymentProvider),
		retryable: v.boolean(),
		fallbackMethods: v.array(v.picklist(paymentProvider)),
		message: v.string(),
	}),
	publicErrorSchema("PaymentConfirmationConflict", {
		retryable: v.boolean(),
		message: v.string(),
	}),
	publicErrorSchema("BankTransactionAlreadyConsumed", {
		message: v.string(),
	}),
	publicErrorSchema("ManualReviewRequired", {
		paymentStatus: v.picklist(paymentStatus),
		message: v.string(),
	}),
]);

export type PaymentError = v.InferOutput<typeof paymentErrorSchema>;
