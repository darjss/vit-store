import type { KhaanTransaction } from "khaan-client";
import {
	type KhaanMatchResult,
	findMatchingKhaanTransfer,
} from "khaan-client/reconciliation";

export function matchKhaanTransfer(input: {
	transactions: KhaanTransaction[];
	paymentNumber: string;
	phone: string;
	expectedAmount: number;
}): KhaanMatchResult {
	const byPhone = findMatchingKhaanTransfer({
		transactions: input.transactions,
		paymentNumber: input.phone,
		expectedAmount: input.expectedAmount,
	});
	if (byPhone.status !== "none") {
		return byPhone;
	}
	return findMatchingKhaanTransfer({
		transactions: input.transactions,
		paymentNumber: input.paymentNumber,
		expectedAmount: input.expectedAmount,
	});
}
