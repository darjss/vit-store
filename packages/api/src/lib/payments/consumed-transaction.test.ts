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

function fakeTx(result: ValuesResult): {
	tx: TransactionType;
	inserted: Record<string, unknown>[];
	selects: string[];
} {
	const inserted: Record<string, unknown>[] = [];
	const selects: string[] = [];
	const tx = {
		insert: () => ({
			values: async (row: Record<string, unknown>) => {
				if (result.rejectWith !== undefined) {
					throw result.rejectWith;
				}
				inserted.push(row);
			},
		}),
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => {
						selects.push("lookup");
						return result.existingPaymentNumber !== undefined
							? [{ paymentNumber: result.existingPaymentNumber }]
							: [];
					},
				}),
			}),
		}),
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
});
