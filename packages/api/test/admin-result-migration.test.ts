import { describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import {
	adminMutationSuccessSchema,
	deserializeResult,
	purchaseErrorSchema,
	sanitizePublicTrpcErrorShape,
	serializeResult,
	type PurchaseError,
} from "@vit/shared";
import { Result } from "better-result";
import * as v from "valibot";
import { aggregateBatchResult } from "../src/operations/admin-order/batch-result";
import { purchaseErrorToLegacyTrpc } from "../src/operations/purchase/legacy";
import {
	validatePurchaseDeletion,
	validatePurchaseItemUpdate,
	validatePurchaseReceipt,
} from "../src/operations/purchase/rules";
import { toLegacyTrpc } from "../src/result/legacy-trpc";

const purchaseSchemas = {
	value: adminMutationSuccessSchema,
	error: purchaseErrorSchema,
};

const expectErrorTag = (
	result: Result<unknown, PurchaseError>,
	tag: PurchaseError["_tag"],
) => {
	expect(result.status).toBe("error");
	if (result.status === "error") expect(result.error._tag).toBe(tag);
};

describe("purchase business rules", () => {
	test("returns every update rule as a typed failure", () => {
		expectErrorTag(
			validatePurchaseItemUpdate(
				[
					{
						id: 1,
						quantityOrdered: 2,
						receiptItems: [{ quantityReceived: 1 }],
					},
				],
				[],
			),
			"CannotRemoveReceivedItem",
		);
		expectErrorTag(
			validatePurchaseItemUpdate([], [{ id: 99, quantityOrdered: 1 }]),
			"PurchaseItemNotFound",
		);
		expectErrorTag(
			validatePurchaseItemUpdate(
				[
					{
						id: 1,
						quantityOrdered: 3,
						receiptItems: [{ quantityReceived: 2 }],
					},
				],
				[{ id: 1, quantityOrdered: 1 }],
			),
			"OrderedQuantityBelowReceived",
		);
	});

	test("returns every receipt rule before writes", () => {
		expectErrorTag(
			validatePurchaseReceipt(undefined, [], []),
			"PurchaseNotFound",
		);
		expectErrorTag(
			validatePurchaseReceipt({ cancelledAt: new Date() }, [], []),
			"CancelledPurchaseCannotReceive",
		);
		expectErrorTag(
			validatePurchaseReceipt(
				{ cancelledAt: null },
				[],
				[{ purchaseItemId: 1, quantityReceived: 1 }],
			),
			"ReceiptItemsMismatch",
		);
		expectErrorTag(
			validatePurchaseReceipt(
				{ cancelledAt: null },
				[
					{ id: 1, productId: 1, quantityOrdered: 2, receiptItems: [] },
					{ id: 2, productId: 2, quantityOrdered: 2, receiptItems: [] },
				],
				[
					{ purchaseItemId: 1, quantityReceived: 1 },
					{ purchaseItemId: 3, quantityReceived: 1 },
				],
			),
			"PurchaseItemNotFound",
		);
		expectErrorTag(
			validatePurchaseReceipt(
				{ cancelledAt: null },
				[
					{
						id: 1,
						productId: 1,
						quantityOrdered: 3,
						receiptItems: [{ quantityReceived: 2 }],
					},
				],
				[{ purchaseItemId: 1, quantityReceived: 2 }],
			),
			"ReceiptExceedsRemaining",
		);
	});

	test("blocks deletion after a receipt", () => {
		expectErrorTag(validatePurchaseDeletion(undefined), "PurchaseNotFound");
		expectErrorTag(
			validatePurchaseDeletion({ receipts: [{ id: 1 }] }),
			"CannotDeletePurchaseWithReceipts",
		);
	});
});

describe("legacy and v2 compatibility", () => {
	test("keeps the legacy success DTO", () => {
		const value = { message: "Purchase updated successfully" };
		expect(toLegacyTrpc(Result.ok(value), purchaseErrorToLegacyTrpc)).toEqual(
			value,
		);
	});

	test("maps a typed failure to the legacy tRPC code", () => {
		const error: PurchaseError = {
			_tag: "PurchaseNotFound",
			message: "Худалдан авалт олдсонгүй.",
		};
		expect(() =>
			toLegacyTrpc(Result.err(error), purchaseErrorToLegacyTrpc),
		).toThrow(TRPCError);
		try {
			toLegacyTrpc(Result.err(error), purchaseErrorToLegacyTrpc);
		} catch (caught) {
			expect(caught).toBeInstanceOf(TRPCError);
			if (caught instanceof TRPCError) expect(caught.code).toBe("NOT_FOUND");
		}
	});

	test("keeps a v2 expected failure in data", () => {
		const error: PurchaseError = {
			_tag: "CannotDeletePurchaseWithReceipts",
			message: "Хүлээн авалттай худалдан авалтыг устгах боломжгүй.",
		};
		const serialized = serializeResult(Result.err(error), purchaseSchemas);
		expect(serialized.status).toBe("error");
		const hydrated = deserializeResult(
			JSON.parse(JSON.stringify(serialized)),
			purchaseSchemas,
		);
		expect(hydrated.status).toBe("error");
		if (hydrated.status === "error") {
			expect(hydrated.error).toEqual(error);
		}
	});
});

describe("batch aggregation", () => {
	test("returns one aggregate failure with all failed rows", () => {
		const result = aggregateBatchResult(3, [
			{ targetId: 1, targetLabel: "A-1", errorTag: "OrderNotFound" },
			{
				targetId: 2,
				targetLabel: "A-2",
				errorTag: "DeliverySubmissionFailed",
			},
		]);
		expect(result.status).toBe("error");
		if (result.status === "error") {
			expect(result.error._tag).toBe("BatchPartiallyFailed");
			if (result.error._tag === "BatchPartiallyFailed") {
				expect(result.error.succeeded).toBe(1);
				expect(result.error.failures).toHaveLength(2);
			}
		}
	});
});

describe("public redaction", () => {
	test("removes raw messages, stack, cause, and unsafe correlation IDs", () => {
		const sanitized = sanitizePublicTrpcErrorShape({
			message: "postgres password=secret",
			code: -32603,
			data: {
				code: "INTERNAL_SERVER_ERROR",
				httpStatus: 500,
				stack: "secret stack",
				cause: { token: "secret" },
				correlationId: "bad id with spaces",
			},
		});
		expect(sanitized.message).toBe("Internal server error");
		expect(JSON.stringify(sanitized)).not.toContain("secret");
		expect(sanitized.data.correlationId).toBeUndefined();
	});

	test("preserves only a safe correlation ID", () => {
		const sanitized = sanitizePublicTrpcErrorShape(
			{
				message: "raw",
				code: -32603,
				data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
			},
			500,
			"req_01HX-safe",
		);
		expect(sanitized.data.correlationId).toBe("req_01HX-safe");
	});
});

describe("purchase contract strictness", () => {
	test("rejects sensitive extra fields", () => {
		const parsed = v.safeParse(purchaseErrorSchema, {
			_tag: "PurchaseNotFound",
			message: "safe",
			stack: "must not cross the wire",
		});
		expect(parsed.success).toBe(false);
	});
});
