import {
	formatBankTransferDetails,
	type PaymentRef,
	TRANSFER_CLAIM_ACK_MESSAGE,
	type TransferStatus,
} from "@vit/assistant";

// Deterministic post-order payment flow, WITHOUT the model (mirrors
// cart-handler.ts, #21). Two transitions run here:
//   1. choose-transfer — the customer tapped `Дансаар шилжүүлэх`: fetch the
//      order total + reference and reply with the bank details + a `Шилжүүлсэн`
//      button.
//   2. transfer-claim — the customer reported paying (button, "хийсэн" text, or
//      a screenshot): record the CLAIM and acknowledge it. ADR 0004: a claim is
//      NEVER a confirmation — `deps.claimTransfer` records `customer_claimed_paid`
//      and notifies admin, and this path calls NO confirmation API, so the order
//      stays pending until admin/bank verification.

export interface PaymentHandlerDeps {
	// Order total (transfer amount) + reference (customer phone) for the chosen
	// payment. Backed by the store `payment.getPaymentByNumber` boundary.
	fetchPaymentSummary: (
		ref: PaymentRef,
	) => Promise<{ amount: number; reference: string }>;
	// Records the transfer CLAIM (status → customer_claimed_paid + admin notify).
	// NOT a confirmation. Backed by `payment.claimTransferPaid`.
	claimTransfer: (ref: PaymentRef) => Promise<{
		outcome:
			| "changed"
			| "already_claimed"
			| "already_confirmed"
			| "refused";
	}>;
	// Sends the bank details text PLUS the `Шилжүүлсэн` claim button.
	sendBankDetails: (text: string, ref: PaymentRef) => Promise<unknown>;
	// Plain text reply (the claim acknowledgement).
	sendText: (text: string) => Promise<unknown>;
	// Persists the transfer status on the per-session checkout record so a later
	// free-text/screenshot claim is recognised. Optional (best-effort context).
	setTransferStatus?: (status: TransferStatus) => Promise<void>;
}

// Customer picked bank transfer: show the account/amount/reference + claim
// button. The send is the durable customer-facing step; persistence is
// best-effort context for recognising a later free-text claim.
export const handleChooseTransfer = async (
	ref: PaymentRef,
	deps: PaymentHandlerDeps,
): Promise<void> => {
	const summary = await deps.fetchPaymentSummary(ref);
	await deps.setTransferStatus?.("transfer_pending");
	await deps.sendBankDetails(
		formatBankTransferDetails({
			amount: summary.amount,
			reference: summary.reference,
		}),
		ref,
	);
};

// Customer claims they transferred. Record the claim (pending, never confirmed)
// then acknowledge. The claim write is first so a failure surfaces (retryable);
// the order is untouched beyond `customer_claimed_paid`.
export const handleTransferClaim = async (
	ref: PaymentRef,
	deps: PaymentHandlerDeps,
): Promise<void> => {
	const claim = await deps.claimTransfer(ref);
	if (claim.outcome === "already_confirmed") {
		await deps.sendText("Төлбөр аль хэдийн баталгаажсан байна.");
		return;
	}
	if (claim.outcome === "refused") {
		await deps.sendText(
			"Амжилтгүй болсон төлбөр дээр шилжүүлгийн мэдэгдэл хүлээн авах боломжгүй.",
		);
		return;
	}
	await deps.setTransferStatus?.("transfer_claimed");
	await deps.sendText(TRANSFER_CLAIM_ACK_MESSAGE);
};
