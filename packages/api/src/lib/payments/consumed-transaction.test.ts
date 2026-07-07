import { describe, expect, test } from "bun:test";
import type { TransactionType } from "~/lib/types";
import {
	KhaanTransactionAlreadyConsumedError,
	isUniqueViolation,
	recordConsumedKhaanTransaction,
} from "./consumed-transaction";

type ValuesResult = { rejectWith?: unknown };

function fakeTx(result: ValuesResult): {
	tx: TransactionType;
	inserted: Record<string, unknown>[];
} {
	const inserted: Record<string, unknown>[] = [];
	const tx = {
		insert: () => ({
			values: async (row: Record<string, unknown>) => {
				if (result.rejectWith !== undefined) {
					throw result.rejectWith;
				}
				inserted.push(row);
			},
		}),
	} as unknown as TransactionType;
	return { tx, inserted };
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
		const { tx, inserted } = fakeTx({});
		await recordConsumedKhaanTransaction(tx, {
			fingerprint: "abc123",
			paymentNumber: "PAY0001",
		});
		expect(inserted).toEqual([
			{ fingerprint: "abc123", paymentNumber: "PAY0001" },
		]);
	});

	test("translates a unique-violation into the already-consumed error", async () => {
		const { tx } = fakeTx({ rejectWith: { code: "23505" } });
		await expect(
			recordConsumedKhaanTransaction(tx, {
				fingerprint: "dup-fingerprint",
				paymentNumber: "PAY0002",
			}),
		).rejects.toBeInstanceOf(KhaanTransactionAlreadyConsumedError);
	});

	test("rethrows unrelated errors unchanged", async () => {
		const boom = new Error("connection reset");
		const { tx } = fakeTx({ rejectWith: boom });
		await expect(
			recordConsumedKhaanTransaction(tx, {
				fingerprint: "x",
				paymentNumber: "PAY0003",
			}),
		).rejects.toBe(boom);
	});
});
