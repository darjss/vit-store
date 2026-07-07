import { describe, expect, mock, test } from "bun:test";
import type { TransactionType } from "~/lib/types";

// `db()` is stubbed so confirmPaymentAndApplyStock runs against an in-memory
// fake transaction. The fake models real PostgreSQL aborted-transaction
// semantics: after a rejected insert on the tx handle, the tx enters
// "aborted" state (25P02) and every subsequent command on that SAME handle
// throws. A nested tx.transaction() (SAVEPOINT) gives a fresh sub-handle
// whose failure does NOT poison the parent.
type FakeTxConfig = {
	insertedRows: Record<string, unknown>[];
	// Rows returned by the status-flip UPDATE; [] simulates a lost race
	// (another path already flipped status→success).
	updateReturning: Record<string, unknown>[];
	// Throw from the insert (e.g. a unique-violation) to exercise replay abort.
	insertThrows?: unknown;
	// When the insert unique-violates, the existing consumed-tx row's
	// paymentNumber (returned by the lookup select on the outer tx).
	existingPaymentNumber?: string;
};

function makeFakeTx(config: FakeTxConfig): TransactionType {
	let aborted = false;

	const ensureAlive = () => {
		if (aborted) {
			throw Object.assign(new Error("current transaction is aborted"), {
				code: "25P02",
			});
		}
	};

	const buildInsert = () => ({
		values: async (row: Record<string, unknown>) => {
			ensureAlive();
			if (config.insertThrows !== undefined) {
				aborted = true;
				throw config.insertThrows;
			}
			config.insertedRows.push(row);
		},
	});

	const buildSelect = () => ({
		from: () => ({
			where: () => ({
				limit: async () => {
					ensureAlive();
					return config.existingPaymentNumber !== undefined
						? [{ paymentNumber: config.existingPaymentNumber }]
						: [];
				},
			}),
		}),
	});

	const tx = {
		insert: () => buildInsert(),
		select: () => buildSelect(),
		update: () => ({
			set: () => ({
				where: () => ({
					returning: async () => {
						ensureAlive();
						return config.updateReturning;
					},
				}),
			}),
		}),
		query: {
			OrderDetailsTable: {
				findMany: async () => {
					ensureAlive();
					return [];
				},
			},
		},
		// SAVEPOINT: a nested transaction gives a fresh sub-handle. A failure
		// inside the savepoint rolls back ONLY the savepoint; the parent tx
		// remains usable (not aborted).
		transaction: async (cb: (sp: TransactionType) => Promise<unknown>) => {
			const sp = {
				insert: () => buildInsert(),
				select: () => buildSelect(),
			} as unknown as TransactionType;
			const wasAborted = aborted;
			try {
				return await cb(sp);
			} catch (error) {
				aborted = wasAborted;
				throw error;
			}
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

	test("aborts the confirm when a different payment already consumed the fingerprint (genuine replay)", async () => {
		currentConfig = {
			insertedRows: [],
			updateReturning: [{ id: 1, orderId: 10 }],
			// A unique-violation on insert. The savepoint rolls back, the outer
			// tx survives, and the lookup finds a DIFFERENT paymentNumber →
			// KhaanTransactionAlreadyConsumedError → the whole confirm tx
			// rolls back (no status flip, no stock applied).
			insertThrows: { code: "23505" },
			existingPaymentNumber: "PAY9999",
		};

		await expect(
			paymentQueries.store.confirmPaymentAndApplyStock(
				"PAY0003",
				"transfer",
				[{ fingerprint: "fp-replay" }],
			),
		).rejects.toThrow();

		// No status flip completed; the transaction rolled back. The
		// KhaanTransactionAlreadyConsumedError propagated through
		// confirmPaymentAndApplyStock's db().transaction() as a rollback.
	});
});
