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
		if (isUniqueViolation(error)) {
			throw new KhaanTransactionAlreadyConsumedError(input.fingerprint);
		}
		throw error;
	}
}
