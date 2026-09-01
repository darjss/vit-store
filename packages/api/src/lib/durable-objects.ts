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
	const namespace: ReconciliationNamespace = env.KHAAN_TRANSFER_RECONCILER;
	return namespace.getByName(paymentNumber);
};
