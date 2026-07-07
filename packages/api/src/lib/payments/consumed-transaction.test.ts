import { describe, expect, test } from "bun:test";
import type { TransactionType } from "~/lib/types";
import {
	KhaanTransactionAlreadyConsumedError,
	isUniqueViolation,
	recordConsumedKhaanTransaction,
} from "./consumed-transaction";

type ValuesResult = {
	rejectWith?: unknown;
	// When the insert unique-violates, the existing row's paymentNumber.
	existingPaymentNumber?: string;
};

// Fake tx that models real PostgreSQL aborted-transaction semantics:
// after a rejected command on the tx handle, the tx enters "aborted" state
// (25P02) and every subsequent command on that SAME handle throws. A
// nested tx.transaction() (SAVEPOINT) gives a fresh sub-handle whose
// failure does NOT poison the parent — the parent remains usable after the
// savepoint rolls back. This mirrors drizzle's real behavior: the outer tx
// survives a savepoint rollback.
function fakeTx(result: ValuesResult): {
	tx: TransactionType;
	inserted: Record<string, unknown>[];
	selects: string[];
} {
	const inserted: Record<string, unknown>[] = [];
	const selects: string[] = [];
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
			if (result.rejectWith !== undefined) {
				// A unique-violation aborts THIS handle's transaction.
				aborted = true;
				throw result.rejectWith;
			}
			inserted.push(row);
		},
	});

	const buildSelect = () => ({
		from: () => ({
			where: () => ({
				limit: async () => {
					ensureAlive();
					selects.push("lookup");
					return result.existingPaymentNumber !== undefined
						? [{ paymentNumber: result.existingPaymentNumber }]
						: [];
				},
			}),
		}),
	});

	const tx = {
		insert: () => buildInsert(),
		select: () => buildSelect(),
		// SAVEPOINT: a nested transaction gives a fresh sub-handle. A failure
		// inside the savepoint rolls back ONLY the savepoint; the parent tx
		// remains usable (not aborted).
		transaction: async (cb: (sp: TransactionType) => Promise<unknown>) => {
			const sp = {
				insert: () => buildInsert(),
				select: () => buildSelect(),
			} as unknown as TransactionType;
			// Run inside the savepoint. If it throws, the savepoint rolls back
			// but the parent's aborted flag is NOT set (savepoint isolation).
			const wasAborted = aborted;
			try {
				return await cb(sp);
			} catch (error) {
				// Rollback to savepoint: restore the parent's pre-savepoint
				// aborted state. The failed insert inside the savepoint must
				// NOT poison the parent.
				aborted = wasAborted;
				throw error;
			}
		},
	} as unknown as TransactionType;
	return { tx, inserted, selects };
}

describe("isUniqueViolation", () => {
	test("detects a postgres unique-violation code", () => {
		expect(isUniqueViolation({ code: "23505" })).toBe(true);
	});

	test("ignores other error codes and non-errors", () => {
		expect(isUniqueViolation({ code: "23503" })).toBe(false);
		expect(isUniqueViolation(new Error("boom"))).toBe(false);
		expect(isUniqueViolation(null)).toBe(false);
	});
});

describe("recordConsumedKhaanTransaction", () => {
	test("inserts the fingerprint row when the ledger is clear", async () => {
		const { tx, inserted, selects } = fakeTx({});
		await recordConsumedKhaanTransaction(tx, {
			fingerprint: "abc123",
			paymentNumber: "PAY0001",
		});
		expect(inserted).toEqual([
			{ fingerprint: "abc123", paymentNumber: "PAY0001" },
		]);
		expect(selects).toEqual([]);
	});

	test("is idempotent when the same paymentNumber already owns the fingerprint", async () => {
		const { tx, inserted, selects } = fakeTx({
			rejectWith: { code: "23505" },
			existingPaymentNumber: "PAY0001",
		});
		await recordConsumedKhaanTransaction(tx, {
			fingerprint: "dup-fingerprint",
			paymentNumber: "PAY0001",
		});
		// No new row inserted; the existing row was left intact.
		expect(inserted).toEqual([]);
		expect(selects).toEqual(["lookup"]);
	});

	test("rejects a genuine replay when a different paymentNumber owns the fingerprint", async () => {
		const { tx, selects } = fakeTx({
			rejectWith: { code: "23505" },
			existingPaymentNumber: "PAY0009",
		});
		await expect(
			recordConsumedKhaanTransaction(tx, {
				fingerprint: "dup-fingerprint",
				paymentNumber: "PAY0002",
			}),
		).rejects.toBeInstanceOf(KhaanTransactionAlreadyConsumedError);
		expect(selects).toEqual(["lookup"]);
	});

	test("rejects when the unique-violation lookup finds no existing row (defensive)", async () => {
		const { tx } = fakeTx({ rejectWith: { code: "23505" } });
		await expect(
			recordConsumedKhaanTransaction(tx, {
				fingerprint: "ghost",
				paymentNumber: "PAY0004",
			}),
		).rejects.toBeInstanceOf(KhaanTransactionAlreadyConsumedError);
	});

	test("rethrows unrelated errors unchanged", async () => {
		const boom = new Error("connection reset");
		const { tx, selects } = fakeTx({ rejectWith: boom });
		await expect(
			recordConsumedKhaanTransaction(tx, {
				fingerprint: "x",
				paymentNumber: "PAY0003",
			}),
		).rejects.toBe(boom);
		// Unrelated errors must NOT trigger the idempotency lookup.
		expect(selects).toEqual([]);
	});

	// Guards the savepoint fix (NEW-1): after a 23505 unique-violation on the
	// insert, the lookup select on the OUTER tx must succeed. Without the
	// savepoint, the insert would abort the tx (25P02) and the select would
	// throw, so the caller would see a raw 23505 instead of the clean
	// idempotent-return / KhaanTransactionAlreadyConsumedError. This test
	// FAILS on the pre-fix code (direct tx.insert → aborted → select throws
	// 25P02 → not KhaanTransactionAlreadyConsumedError, selects stays empty).
	test("savepoint: the lookup select succeeds after a unique-violation (outer tx survives)", async () => {
		const { tx, selects } = fakeTx({
			rejectWith: { code: "23505" },
			existingPaymentNumber: "PAY0001",
		});
		await recordConsumedKhaanTransaction(tx, {
			fingerprint: "sp-fingerprint",
			paymentNumber: "PAY0001",
		});
		// The lookup ran on the outer tx (not aborted by the savepoint
		// rollback). Without the savepoint this would be [] and the call
		// would have thrown a 25P02 instead of returning cleanly.
		expect(selects).toEqual(["lookup"]);
	});

	// Documents the PostgreSQL behavior the savepoint protects against: a
	// direct insert on the tx handle (no savepoint) that unique-violates
	// aborts the tx, and the next command on that handle throws 25P02.
	test("postgres model: a direct insert unique-violation aborts the tx (25P02 on next command)", async () => {
		const { tx } = fakeTx({
			rejectWith: { code: "23505" },
			existingPaymentNumber: "PAY0001",
		});
		// Direct insert on the tx handle (bypassing the savepoint) aborts it.
		await expect(
			(tx as unknown as { insert: () => { values: (r: unknown) => Promise<void> } })
				.insert()
				.values({ fingerprint: "direct", paymentNumber: "PAY0001" }),
		).rejects.toMatchObject({ code: "23505" });
		// The next command on the SAME handle throws 25P02 (aborted tx).
		await expect(
			(tx as unknown as {
				select: () => { from: () => { where: () => { limit: () => Promise<unknown[]> } } };
			})
				.select()
				.from()
				.where()
				.limit(),
		).rejects.toMatchObject({ code: "25P02" });
	});
});
