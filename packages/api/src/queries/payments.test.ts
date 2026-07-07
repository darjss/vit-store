import { describe, expect, mock, test } from "bun:test";
import type { TransactionType } from "~/lib/types";

// `db()` is stubbed so confirmPaymentAndApplyStock runs against an in-memory
// fake transaction. The fake only needs the methods touched on the
// fingerprint + status-flip path; the stock-application path is exercised
// only on the "wins the flip" case with an empty order-details list.
type FakeTxConfig = {
	insertedRows: Record<string, unknown>[];
	// Rows returned by the status-flip UPDATE; [] simulates a lost race
	// (another path already flipped status→success).
	updateReturning: Record<string, unknown>[];
	// Throw from the insert (e.g. a unique-violation) to exercise replay abort.
	insertThrows?: unknown;
};

function makeFakeTx(config: FakeTxConfig): TransactionType {
	const tx = {
		insert: () => ({
			values: async (row: Record<string, unknown>) => {
				if (config.insertThrows !== undefined) {
					throw config.insertThrows;
				}
				config.insertedRows.push(row);
			},
		}),
		update: () => ({
			set: () => ({
				where: () => ({
					returning: async () => config.updateReturning,
				}),
			}),
		}),
		query: {
			OrderDetailsTable: {
				findMany: async () => [],
			},
		},
	} as unknown as TransactionType;
	return tx;
}

let currentConfig: FakeTxConfig = {
	insertedRows: [],
	updateReturning: [],
};

mock.module("~/db/client", () => ({
	db: () => ({
		transaction: async (cb: (tx: TransactionType) => Promise<unknown>) =>
			cb(makeFakeTx(currentConfig)),
	}),
}));

// Imported after the mock is registered so payments.ts picks up the stubbed db.
const { paymentQueries } = await import("~/queries/payments");

describe("confirmPaymentAndApplyStock — DO/admin race (P0-2)", () => {
	test("records the fingerprint even when the status flip loses the race", async () => {
		currentConfig = {
			insertedRows: [],
			// Another path already flipped status→success: UPDATE claims 0 rows.
			updateReturning: [],
		};

		const confirmed = await paymentQueries.store.confirmPaymentAndApplyStock(
			"PAY0001",
			"transfer",
			[{ fingerprint: "fp-race-loser" }],
		);

		// The call reports "not confirmed" (it did not apply stock)...
		expect(confirmed).toBe(false);
		// ...but the fingerprint was still recorded BEFORE the flip, so the
		// bank transaction cannot be replayed against a later order.
		expect(currentConfig.insertedRows).toEqual([
			{ fingerprint: "fp-race-loser", paymentNumber: "PAY0001" },
		]);
	});

	test("records the fingerprint and confirms when it wins the flip", async () => {
		currentConfig = {
			insertedRows: [],
			updateReturning: [{ id: 1, orderId: 10 }],
		};

		const confirmed = await paymentQueries.store.confirmPaymentAndApplyStock(
			"PAY0002",
			"transfer",
			[{ fingerprint: "fp-winner" }],
		);

		expect(confirmed).toBe(true);
		expect(currentConfig.insertedRows).toContainEqual({
			fingerprint: "fp-winner",
			paymentNumber: "PAY0002",
		});
	});

	test("aborts the confirm when a fingerprint insert fails (genuine replay)", async () => {
		currentConfig = {
			insertedRows: [],
			updateReturning: [{ id: 1, orderId: 10 }],
			// A unique-violation on insert. The real recordConsumedKhaanTransaction
			// would then look up the existing row and throw
			// KhaanTransactionAlreadyConsumedError for a different paymentNumber;
			// the fake tx has no select(), so the lookup itself throws and the
			// transaction still aborts — proving a fingerprint-insert failure
			// prevents the confirm from proceeding.
			insertThrows: { code: "23505" },
		};

		await expect(
			paymentQueries.store.confirmPaymentAndApplyStock(
				"PAY0003",
				"transfer",
				[{ fingerprint: "fp-replay" }],
			),
		).rejects.toThrow();

		// No status flip completed; the transaction rolled back.
	});
});
