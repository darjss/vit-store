import type { TransferReconciliationState } from "~/lib/payments/transfer-reconciliation-status";

export type TransferReconciliationStub = {
	start(input: { paymentNumber: string }): Promise<unknown>;
	getStatus(): Promise<TransferReconciliationState | null>;
	collectMatchingKhaanFingerprints(
		paymentNumber: string,
	): Promise<string[] | null>;
};

/**
 * Minimal namespace shape for `getByName` — avoids the TS2589 deep-instantiation
 * that the full Alchemy-generated `DurableObjectNamespace<any & Rpc.DurableObjectBranded>`
 * triggers. The `TransferReconciliationObject` class can't be used as the
 * Alchemy binding type parameter because it extends `DurableObject<Env>`,
 * creating a recursive type reference.
 */
type ReconciliationNamespace = {
	getByName(name: string): TransferReconciliationStub;
};

/**
 * Get a typed RPC stub for the transfer-reconciliation DO scoped to a single
 * payment number.
 */
export const getTransferReconciliationStub = (
	env: Env,
	paymentNumber: string,
): TransferReconciliationStub =>
	(env.KHAAN_TRANSFER_RECONCILER as unknown as ReconciliationNamespace).getByName(
		paymentNumber,
	);
