import { eq } from "drizzle-orm";
import { KhaanConsumedTransactionsTable } from "~/db/schema";
import type { TransactionType } from "~/lib/types";

export class KhaanTransactionAlreadyConsumedError extends Error {
	readonly fingerprint: string;

	constructor(fingerprint: string) {
		super(`Khaan transaction already consumed: ${fingerprint}`);
		this.name = "KhaanTransactionAlreadyConsumedError";
		this.fingerprint = fingerprint;
	}
}

export function isUniqueViolation(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "23505"
	);
}

// Records a fingerprint as consumed by a payment, idempotently.
//
// On a unique-violation (the fingerprint is already in the ledger), we look up
// the existing row's paymentNumber:
//   - same paymentNumber → idempotent success (this payment already consumed
//     this transaction on a prior/racing call; nothing to do).
//   - different paymentNumber → genuine replay (a different order already
//     consumed this bank transaction) → throw KhaanTransactionAlreadyConsumedError
//     so the caller aborts the confirm.
//
// This makes consumption independent of which call wins the payment status
// flip: a DO poll that loses the race to an admin confirm still records its
// fingerprint, and a later replay by a different payment is still rejected.
export async function recordConsumedKhaanTransaction(
	tx: TransactionType,
	input: { fingerprint: string; paymentNumber: string },
): Promise<void> {
	try {
		await tx.insert(KhaanConsumedTransactionsTable).values({
			fingerprint: input.fingerprint,
			paymentNumber: input.paymentNumber,
		});
	} catch (error) {
		if (!isUniqueViolation(error)) {
			throw error;
		}
		const existing = await tx
			.select({ paymentNumber: KhaanConsumedTransactionsTable.paymentNumber })
			.from(KhaanConsumedTransactionsTable)
			.where(eq(KhaanConsumedTransactionsTable.fingerprint, input.fingerprint))
			.limit(1);
		if (existing[0]?.paymentNumber === input.paymentNumber) {
			return;
		}
		throw new KhaanTransactionAlreadyConsumedError(input.fingerprint);
	}
}
