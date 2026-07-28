import {
	formatBankTransferDetails,
	type PaymentRef,
	TRANSFER_CLAIM_ACK_MESSAGE,
	type TransferStatus,
} from "@vit/assistant";
import type { DeliveryFailure } from "@vit/shared";
import { Result, type Result as BetterResult } from "better-result";
import { matchAsync } from "dismatch/async";
import type {
	PaymentOperationFailure,
	PaymentSummary,
	TransferClaimResult,
} from "../lib/payment";

export class PaymentPostcommitError extends Error {
	constructor() {
		super("Payment postcommit action failed.");
		this.name = "PaymentPostcommitError";
	}
}

export interface PaymentHandlerDeps {
	fetchPaymentSummary: (
		ref: PaymentRef,
	) => Promise<BetterResult<PaymentSummary, PaymentOperationFailure>>;
	claimTransfer: (
		ref: PaymentRef,
	) => Promise<BetterResult<TransferClaimResult, PaymentOperationFailure>>;
	sendBankDetails: (
		text: string,
		ref: PaymentRef,
	) => Promise<BetterResult<unknown, DeliveryFailure>>;
	sendText: (text: string) => Promise<BetterResult<unknown, DeliveryFailure>>;
	setTransferStatus?: (status: TransferStatus) => Promise<void>;
}

const logPostcommitDelivery = async (
	delivery: Promise<BetterResult<unknown, DeliveryFailure>>,
	operation: string,
) => {
	let result: BetterResult<unknown, DeliveryFailure>;
	try {
		result = await delivery;
	} catch {
		throw new PaymentPostcommitError();
	}
	if (result.status === "error") {
		console.warn("[payment] postcommit delivery failed", {
			operation,
			error_tag: result.error._tag,
			provider: result.error.provider,
			code: result.error.code,
		});
	}
};

export const handleChooseTransfer = async (
	ref: PaymentRef,
	deps: PaymentHandlerDeps,
): Promise<BetterResult<void, PaymentOperationFailure>> => {
	const summary = await deps.fetchPaymentSummary(ref);
	if (summary.status === "error") {
		return Result.err(summary.error);
	}
	try {
		await deps.setTransferStatus?.("transfer_pending");
		await logPostcommitDelivery(
			deps.sendBankDetails(
				formatBankTransferDetails({
					amount: summary.value.total,
					reference: summary.value.order.customerPhone,
				}),
				ref,
			),
			"payment.bank_details",
		);
	} catch (error) {
		if (error instanceof PaymentPostcommitError) throw error;
		throw new PaymentPostcommitError();
	}
	return Result.ok(undefined);
};

const claimOutcomeTags = {
	changed: { _tag: "changed" },
	already_claimed: { _tag: "already_claimed" },
	already_confirmed: { _tag: "already_confirmed" },
	refused: { _tag: "refused" },
} as const satisfies Record<
	TransferClaimResult["outcome"],
	{ _tag: TransferClaimResult["outcome"] }
>;

export const handleTransferClaim = async (
	ref: PaymentRef,
	deps: PaymentHandlerDeps,
): Promise<BetterResult<void, PaymentOperationFailure>> => {
	const claim = await deps.claimTransfer(ref);
	if (claim.status === "error") return Result.err(claim.error);

	return matchAsync(
		claimOutcomeTags[claim.value.outcome],
		"_tag",
	)<BetterResult<void, PaymentOperationFailure>>({
		already_confirmed: async () => {
			await logPostcommitDelivery(
				deps.sendText("Төлбөр аль хэдийн баталгаажсан байна."),
				"payment.already_confirmed",
			);
			return Result.ok(undefined);
		},
		refused: async () => {
			await logPostcommitDelivery(
				deps.sendText(
					"Амжилтгүй болсон төлбөр дээр шилжүүлгийн мэдэгдэл хүлээн авах боломжгүй.",
				),
				"payment.refused",
			);
			return Result.ok(undefined);
		},
		changed: async () => {
			try {
				await deps.setTransferStatus?.("transfer_claimed");
				await logPostcommitDelivery(
					deps.sendText(TRANSFER_CLAIM_ACK_MESSAGE),
					"payment.claim_ack",
				);
			} catch (error) {
				if (error instanceof PaymentPostcommitError) throw error;
				throw new PaymentPostcommitError();
			}
			return Result.ok(undefined);
		},
		already_claimed: async () => {
			await logPostcommitDelivery(
				deps.sendText(TRANSFER_CLAIM_ACK_MESSAGE),
				"payment.repeat_claim_ack",
			);
			return Result.ok(undefined);
		},
	});
};
