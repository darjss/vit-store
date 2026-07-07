import type { KhaanTransaction } from "khaan-client";
import {
	type KhaanMatchResult,
	findMatchingKhaanTransfer,
} from "khaan-client/reconciliation";

const NO_MATCH: KhaanMatchResult = { status: "none", matches: [] };

export function matchKhaanTransfer(input: {
	transactions: KhaanTransaction[];
	paymentNumber: string;
	phone: string;
	expectedAmount: number;
}): KhaanMatchResult {
	const phone = input.phone.trim();
	const paymentNumber = input.paymentNumber.trim();

	const byPhone = phone
		? findMatchingKhaanTransfer({
				transactions: input.transactions,
				paymentNumber: phone,
				expectedAmount: input.expectedAmount,
			})
		: NO_MATCH;
	if (byPhone.status !== "none") {
		return byPhone;
	}
	if (!paymentNumber) {
		return NO_MATCH;
	}
	return findMatchingKhaanTransfer({
		transactions: input.transactions,
		paymentNumber,
		expectedAmount: input.expectedAmount,
	});
}
