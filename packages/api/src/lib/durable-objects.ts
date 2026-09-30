import type { TransferReconciliationRpc } from "../../../../apps/server/alchemy.run";

export const getTransferReconciliationStub = (
	env: Env,
	paymentNumber: string,
): DurableObjectStub<TransferReconciliationRpc> =>
	env.KHAAN_TRANSFER_RECONCILER.getByName(paymentNumber);
