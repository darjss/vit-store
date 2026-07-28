import { TRPCError } from "@trpc/server";
import { paymentProvider, paymentStatus } from "@vit/shared";
import * as v from "valibot";
import type { Context } from "~/lib/context";
import { getTransferReconciliationStub } from "~/lib/durable-objects";
import {
	adminProcedure,
	type baseProcedure,
	botProcedure,
	router,
} from "~/lib/trpc";
import { generatePaymentNumber } from "~/lib/utils";
import {
	confirmTransferPayment,
	paymentErrorToLegacyTrpc,
	paymentReviewResultSchemas,
	rejectTransferPayment,
} from "~/operations/admin-payment";
import { serializeOperationResult } from "~/operations/serialize-operation-result";
import { paymentQueries } from "~/queries/payments";
import { runLegacyOperation } from "~/result/run-legacy-operation";

const paymentNumberInputSchema = v.object({ paymentNumber: v.string() });

const runRead = async <Value>(
	ctx: Context,
	event: string,
	message: string,
	read: () => Promise<Value>,
) => {
	try {
		return await read();
	} catch (error) {
		ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
			event,
		});
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message,
			cause: error,
		});
	}
};

export function buildPaymentRouter<P extends typeof baseProcedure>(proc: P) {
	return router({
		createPayment: proc
			.input(
				v.object({
					orderId: v.pipe(v.number(), v.integer(), v.minValue(1)),
					status: v.picklist(paymentStatus),
					provider: v.picklist(paymentProvider),
					amount: v.pipe(v.number(), v.integer(), v.minValue(0)),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					return await paymentQueries.admin.createPayment({
						paymentNumber: generatePaymentNumber(),
						...input,
					});
				} catch (error) {
					ctx.log.error(
						error instanceof Error ? error : new Error(String(error)),
						{ event: "createPayment" },
					);
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create payment",
						cause: error,
					});
				}
			}),
		getPayments: proc.query(({ ctx }) =>
			runRead(ctx, "getPayments", "Failed to get payments", () =>
				paymentQueries.admin.getPayments(),
			),
		),
		getPendingPayments: proc.query(({ ctx }) =>
			runRead(ctx, "getPendingPayments", "Failed to get pending payments", () =>
				paymentQueries.admin.getPendingPayments(),
			),
		),
		getPendingMessengerNotifications: proc.query(({ ctx }) =>
			runRead(
				ctx,
				"getPendingMessengerNotifications",
				"Failed to get pending messenger notifications",
				() => paymentQueries.admin.getPendingMessengerNotifications(),
			),
		),
		getClaimedTransferCount: proc.query(({ ctx }) =>
			runRead(
				ctx,
				"getClaimedTransferCount",
				"Failed to get claimed transfer count",
				() => paymentQueries.admin.getClaimedTransferCount(),
			),
		),
		getClaimedTransferPayments: proc.query(({ ctx }) =>
			runRead(
				ctx,
				"getClaimedTransferPayments",
				"Failed to get claimed transfer payments",
				() => paymentQueries.admin.getClaimedTransferPayments(),
			),
		),
		getTransferReconciliationStatus: proc
			.input(paymentNumberInputSchema)
			.query(({ ctx, input }) =>
				runRead(
					ctx,
					"admin.transfer_reconciliation_status_failed",
					"Failed to get transfer reconciliation status",
					() =>
						getTransferReconciliationStub(
							ctx.c.env,
							input.paymentNumber,
						).getStatus(),
				),
			),
		confirmTransferPayment: proc
			.input(paymentNumberInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"admin.confirm_transfer_payment_failed",
					"Failed to confirm transfer payment",
					() => confirmTransferPayment(ctx, input.paymentNumber),
					paymentErrorToLegacyTrpc,
				),
			),
		rejectTransferPayment: proc
			.input(paymentNumberInputSchema)
			.mutation(({ ctx, input }) =>
				runLegacyOperation(
					ctx,
					"admin.reject_transfer_payment_failed",
					"Failed to reject transfer payment",
					() => rejectTransferPayment(ctx, input.paymentNumber),
					paymentErrorToLegacyTrpc,
				),
			),
	});
}

export const paymentV2 = router({
	confirmTransferPayment: adminProcedure
		.input(paymentNumberInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await confirmTransferPayment(ctx, input.paymentNumber),
				paymentReviewResultSchemas,
				{ operation: "admin.payment.confirm_transfer", error_layer: "domain" },
			),
		),
	rejectTransferPayment: adminProcedure
		.input(paymentNumberInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await rejectTransferPayment(ctx, input.paymentNumber),
				paymentReviewResultSchemas,
				{ operation: "admin.payment.reject_transfer", error_layer: "domain" },
			),
		),
});

export const payment = buildPaymentRouter(adminProcedure);
export const paymentBot = buildPaymentRouter(botProcedure);
