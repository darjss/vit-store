import { describe, expect, test } from "bun:test";
import type {
	AdminOrderError,
	AiOperationError,
	CatalogMutationError,
	PaymentError,
	PurchaseError,
} from "@vit/shared";
import {
	presentAdminOrderError,
	presentAiError,
	presentCatalogError,
	presentPaymentError,
	presentPurchaseError,
} from "../../../apps/admin/src/lib/error-presentations/admin-errors";
import {
	getCorrelationId,
	presentTransportError,
} from "../../../apps/admin/src/lib/error-presentations/transport";

const RAW = "RAW_SECRET_PROVIDER_MESSAGE";

const assertSafe = (presentation: {
	title: string;
	description: string;
	reassurance?: string;
	actions: readonly string[];
}) => {
	expect(presentation.title.length).toBeGreaterThan(0);
	expect(presentation.description.length).toBeGreaterThan(0);
	expect(presentation.actions.length).toBeGreaterThan(0);
	expect(JSON.stringify(presentation)).not.toContain(RAW);
};

describe("admin error presentations", () => {
	test("maps every purchase failure without rendering backend copy", () => {
		const failures: PurchaseError[] = [
			{ _tag: "PurchaseNotFound", message: RAW },
			{ _tag: "PurchaseItemNotFound", message: RAW },
			{ _tag: "CannotRemoveReceivedItem", message: RAW },
			{ _tag: "OrderedQuantityBelowReceived", received: 3, message: RAW },
			{ _tag: "CancelledPurchaseCannotReceive", message: RAW },
			{ _tag: "ReceiptItemsMismatch", message: RAW },
			{ _tag: "ReceiptExceedsRemaining", remaining: 2, message: RAW },
			{ _tag: "CannotDeletePurchaseWithReceipts", message: RAW },
			{
				_tag: "InvalidPurchaseTransition",
				from: "draft",
				to: "received",
				message: RAW,
			},
		];
		for (const failure of failures) assertSafe(presentPurchaseError(failure));
	});

	test("maps catalog, order, payment, and AI failures safely", () => {
		const catalog: CatalogMutationError[] = [
			{ _tag: "ResourceNotFound", resource: "product", id: 1, message: RAW },
			{
				_tag: "DuplicateResource",
				resource: "brand",
				field: "slug",
				message: RAW,
			},
			{
				_tag: "DeleteBlocked",
				resource: "category",
				reason: "has-products",
				message: RAW,
			},
			{
				_tag: "InvalidCatalogState",
				resource: "image",
				reason: "invalid-image-url",
				message: RAW,
			},
			{ _tag: "StockConflict", productId: 1, available: 0, message: RAW },
			{ _tag: "ConcurrentUpdate", resource: "customer", id: 99, message: RAW },
		];
		for (const failure of catalog) assertSafe(presentCatalogError(failure));

		const orders: AdminOrderError[] = [
			{ _tag: "OrderNotFound", message: RAW },
			{
				_tag: "InvalidOrderTransition",
				from: "pending",
				to: "delivered",
				message: RAW,
			},
			{ _tag: "StockConflict", items: [], message: RAW },
			{ _tag: "DeliverySubmissionFailed", retryable: true, message: RAW },
			{
				_tag: "BatchPartiallyFailed",
				total: 2,
				succeeded: 1,
				failures: [
					{ targetId: 1, targetLabel: "A-1", errorTag: "OrderNotFound" },
				],
				message: RAW,
			},
		];
		for (const failure of orders) assertSafe(presentAdminOrderError(failure));

		const payments: PaymentError[] = [
			{ _tag: "PaymentNotFound", message: RAW },
			{ _tag: "PaymentAccessDenied", message: RAW },
			{ _tag: "PaymentAlreadyConfirmed", message: RAW },
			{ _tag: "PaymentNotPending", status: "failed", message: RAW },
			{
				_tag: "PaymentMethodMismatch",
				expected: "transfer",
				actual: "qpay",
				message: RAW,
			},
			{
				_tag: "PaymentProviderUnavailable",
				provider: "qpay",
				retryable: true,
				fallbackMethods: ["cash"],
				message: RAW,
			},
			{ _tag: "PaymentConfirmationConflict", retryable: false, message: RAW },
			{ _tag: "BankTransactionAlreadyConsumed", message: RAW },
			{
				_tag: "ManualReviewRequired",
				paymentStatus: "customer_claimed_paid",
				message: RAW,
			},
		];
		for (const failure of payments) assertSafe(presentPaymentError(failure));

		const ai: AiOperationError[] = [
			{ _tag: "InvalidSource", message: RAW },
			{ _tag: "ExtractionFailed", retryable: true, message: RAW },
			{ _tag: "InvalidModelOutput", message: RAW },
			{ _tag: "ProductResolutionRequired", lines: [1], message: RAW },
			{ _tag: "NoUsableImages", message: RAW },
			{ _tag: "ProviderUnavailable", retryable: false, message: RAW },
		];
		for (const failure of ai) assertSafe(presentAiError(failure));
	});
});

describe("transport presentation", () => {
	test("shows a safe correlation ID and no raw error text", () => {
		const error = {
			message: RAW,
			data: { correlationId: "req-safe_123" },
			stack: RAW,
		};
		expect(getCorrelationId(error)).toBe("req-safe_123");
		assertSafe(presentTransportError(error));
	});
});
