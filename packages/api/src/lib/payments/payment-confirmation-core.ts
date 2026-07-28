import type { PaymentError, StockTransitionError } from "@vit/shared";
import { Result, type Result as ResultType } from "better-result";
import { match } from "dismatch";

export type PaymentCommitError =
	| { _tag: "PaymentNotFound" }
	| {
			_tag: "PaymentNotPending";
			status: "pending" | "customer_claimed_paid" | "success" | "failed";
	  }
	| { _tag: "BankTransactionAlreadyConsumed" }
	| { _tag: "StockTransitionFailed"; failure: StockTransitionError };

export type PaymentCommit =
	| { outcome: "confirmed"; orderId: number }
	| { outcome: "already_confirmed"; orderId: number };

export type PaymentConfirmationSuccess = {
	confirmed: true;
	newlyConfirmed: boolean;
	orderNumber?: string;
	recoveryPending: boolean;
};

export type PaymentConfirmationDependencies = {
	commit: () => Promise<ResultType<PaymentCommit, PaymentCommitError>>;
	loadOrderNumber: () => Promise<string | undefined>;
	recover: () => Promise<{ recoveryPending: boolean }>;
};

const publicCommitError = (error: PaymentCommitError): PaymentError =>
	match(
		error,
		"_tag",
	)<PaymentError>({
		PaymentNotFound: () => ({
			_tag: "PaymentNotFound",
			message: "Төлбөрийн мэдээлэл олдсонгүй.",
		}),
		PaymentNotPending: ({ status }) => ({
			_tag: "PaymentNotPending",
			message: "Энэ төлбөр одоо хүлээгдэж буй төлөвт биш байна.",
			status,
		}),
		BankTransactionAlreadyConsumed: () => ({
			_tag: "BankTransactionAlreadyConsumed",
			message: "Банкны гүйлгээг өөр төлбөрт ашигласан байна.",
		}),
		StockTransitionFailed: () => ({
			_tag: "ManualReviewRequired",
			message: "Төлбөрийг ажилтан гараар шалгах шаардлагатай байна.",
			paymentStatus: "pending",
		}),
	});

export const executePaymentConfirmation = async (
	dependencies: PaymentConfirmationDependencies,
): Promise<ResultType<PaymentConfirmationSuccess, PaymentError>> => {
	const committed = await dependencies.commit();
	return committed.match<
		Promise<ResultType<PaymentConfirmationSuccess, PaymentError>>
	>({
		err: async (error) => Result.err(publicCommitError(error)),
		ok: async (commit) => {
			let orderNumber: string | undefined;
			try {
				orderNumber = await dependencies.loadOrderNumber();
			} catch {
				orderNumber = undefined;
			}
			if (commit.outcome === "already_confirmed") {
				return Result.ok({
					confirmed: true,
					newlyConfirmed: false,
					orderNumber,
					recoveryPending: false,
				});
			}

			let recoveryPending = true;
			try {
				recoveryPending = (await dependencies.recover()).recoveryPending;
			} catch {
				// Recovery work is already represented by rows committed with payment.
			}
			return Result.ok({
				confirmed: true,
				newlyConfirmed: true,
				orderNumber,
				recoveryPending,
			});
		},
	});
};
