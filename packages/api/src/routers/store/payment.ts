import {
	nullableTransferReconciliationSchema,
	paymentDetailsSchema,
	paymentErrorSchema,
	paymentStatusSchema,
	qpayCheckSchema,
	qpayInvoiceSchema,
	selectTransferSchema,
	serializeResult,
	transferClaimSchema,
	type PaymentError,
} from "@vit/shared";
import type { Result as ResultType } from "better-result";
import { match } from "dismatch";
import * as v from "valibot";
import {
	checkQpayPayment,
	claimTransfer,
	createQr,
	getPayment,
	getPaymentStatus,
	getTransferReconciliation,
	selectTransfer,
} from "~/operations/payment";
import { publicProcedure, router } from "~/lib/trpc";
import { type LegacyTrpcError, toLegacyTrpc } from "~/result/legacy-trpc";

const paymentInputSchema = v.object({
	paymentNumber: v.string(),
	checkoutToken: v.optional(v.string()),
});

const paymentLegacyError = (error: PaymentError) =>
	match(
		error,
		"_tag",
	)<LegacyTrpcError>({
		PaymentNotFound: () => ({
			code: "NOT_FOUND" as const,
			message: "Payment not found",
		}),
		PaymentAccessDenied: () => ({
			code: "UNAUTHORIZED" as const,
			message: "You are not authorized to access this payment",
		}),
		PaymentAlreadyConfirmed: () => ({
			code: "BAD_REQUEST" as const,
			message: "ALREADY_PAID",
		}),
		PaymentNotPending: () => ({
			code: "PRECONDITION_FAILED" as const,
			message: "Failed payments cannot be claimed",
		}),
		PaymentMethodMismatch: () => ({
			code: "BAD_REQUEST" as const,
			message: "Not a QPay payment",
		}),
		PaymentProviderUnavailable: () => ({
			code: "BAD_GATEWAY" as const,
			message: "Payment provider unavailable",
		}),
		PaymentConfirmationConflict: () => ({
			code: "CONFLICT" as const,
			message: "Payment already confirmed or not pending",
		}),
		BankTransactionAlreadyConsumed: () => ({
			code: "CONFLICT" as const,
			message: "Bank transaction already used by another order",
		}),
		ManualReviewRequired: () => ({
			code: "CONFLICT" as const,
			message: "Payment needs manual review",
		}),
	});

const legacyPayment = router({
	getPaymentByNumber: publicProcedure
		.input(paymentInputSchema)
		.query(async ({ input, ctx }) =>
			toLegacyTrpc(await getPayment(ctx, input), paymentLegacyError),
		),
	claimTransferPaid: publicProcedure
		.input(paymentInputSchema)
		.mutation(async ({ input, ctx }) =>
			toLegacyTrpc(await claimTransfer(ctx, input), paymentLegacyError),
		),
	sendTransferNotification: publicProcedure
		.input(paymentInputSchema)
		.mutation(async ({ input, ctx }) =>
			toLegacyTrpc(
				await claimTransfer(ctx, input, { refusedAsError: true }),
				paymentLegacyError,
			),
		),
	getTransferReconciliationStatus: publicProcedure
		.input(paymentInputSchema)
		.query(async ({ input, ctx }) =>
			toLegacyTrpc(
				await getTransferReconciliation(ctx, input),
				paymentLegacyError,
			),
		),
	getPaymentStatus: publicProcedure
		.input(paymentInputSchema)
		.query(async ({ input, ctx }) =>
			toLegacyTrpc(await getPaymentStatus(ctx, input), paymentLegacyError),
		),
	selectTransfer: publicProcedure
		.input(paymentInputSchema)
		.mutation(async ({ input, ctx }) =>
			toLegacyTrpc(await selectTransfer(ctx, input), paymentLegacyError),
		),
	createQr: publicProcedure
		.input(paymentInputSchema)
		.mutation(async ({ input, ctx }) =>
			toLegacyTrpc(await createQr(ctx, input), paymentLegacyError),
		),
	checkQpayPayment: publicProcedure
		.input(paymentInputSchema)
		.mutation(async ({ input, ctx }) =>
			toLegacyTrpc(await checkQpayPayment(ctx, input), paymentLegacyError),
		),
});

export const payment = legacyPayment;

const serializePayment = async <ValueSchema extends v.GenericSchema>(
	result: Promise<ResultType<v.InferInput<ValueSchema>, PaymentError>>,
	value: ValueSchema,
) => serializeResult(await result, { value, error: paymentErrorSchema });

export const paymentV2 = router({
	getPaymentByNumber: publicProcedure
		.input(paymentInputSchema)
		.query(({ input, ctx }) =>
			serializePayment(getPayment(ctx, input), paymentDetailsSchema),
		),
	claimTransferPaid: publicProcedure
		.input(paymentInputSchema)
		.mutation(({ input, ctx }) =>
			serializePayment(claimTransfer(ctx, input), transferClaimSchema),
		),
	sendTransferNotification: publicProcedure
		.input(paymentInputSchema)
		.mutation(({ input, ctx }) =>
			serializePayment(
				claimTransfer(ctx, input, { refusedAsError: true }),
				transferClaimSchema,
			),
		),
	getTransferReconciliationStatus: publicProcedure
		.input(paymentInputSchema)
		.query(({ input, ctx }) =>
			serializePayment(
				getTransferReconciliation(ctx, input),
				nullableTransferReconciliationSchema,
			),
		),
	getPaymentStatus: publicProcedure
		.input(paymentInputSchema)
		.query(({ input, ctx }) =>
			serializePayment(getPaymentStatus(ctx, input), paymentStatusSchema),
		),
	selectTransfer: publicProcedure
		.input(paymentInputSchema)
		.mutation(({ input, ctx }) =>
			serializePayment(selectTransfer(ctx, input), selectTransferSchema),
		),
	createQr: publicProcedure
		.input(paymentInputSchema)
		.mutation(({ input, ctx }) =>
			serializePayment(createQr(ctx, input), qpayInvoiceSchema),
		),
	checkQpayPayment: publicProcedure
		.input(paymentInputSchema)
		.mutation(({ input, ctx }) =>
			serializePayment(checkQpayPayment(ctx, input), qpayCheckSchema),
		),
});
