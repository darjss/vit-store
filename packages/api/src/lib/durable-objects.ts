import type { TransferReconciliationState } from "~/lib/payments/transfer-reconciliation-status";

export type TransferReconciliationStub = {
	collectMatchingKhaanFingerprints(paymentNumber: string): Promise<Array<string> | null>;
	getStatus(): Promise<TransferReconciliationState | null>;
	start(input: { paymentNumber: string }): Promise<TransferReconciliationState | null>;
};

type ReconciliationNamespace = {
	getByName(name: string): TransferReconciliationStub;
};

export const getTransferReconciliationStub = (
	env: Env,
	paymentNumber: string,
): TransferReconciliationStub => {
	// SAFETY: the Alchemy-generated namespace type trips TS2589; ReconciliationNamespace is the only method used.
	// oxlint-disable-next-line anti-slop/no-chained-type-assertions
	const namespace = env.KHAAN_TRANSFER_RECONCILER as unknown as ReconciliationNamespace;
	return namespace.getByName(paymentNumber);
};
