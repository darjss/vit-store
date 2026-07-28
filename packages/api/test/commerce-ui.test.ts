import { describe, expect, test } from "bun:test";
import {
	checkoutErrorSchema,
	paymentErrorSchema,
	transferReconciliationSchema,
	type CheckoutError,
	type PaymentError,
} from "@vit/shared";
import * as v from "valibot";
import { qpayWebhookStatus } from "../../../apps/server/src/lib/payment-webhook-status";
import {
	addCheckoutIdempotency,
	clearCheckoutIdempotency,
} from "../../../apps/storev2/src/lib/checkout-idempotency";
import {
	checkoutErrorPresentation,
	paymentErrorPresentation,
	reconciliationPresentation,
} from "../../../apps/storev2/src/lib/error-presentations/commerce";

const checkoutErrors: CheckoutError[] = [
	{ _tag: "CartEmpty", message: "Сагс хоосон байна." },
	{
		_tag: "CartChanged",
		message: "Сагсны мэдээлэл өөрчлөгдсөн байна.",
		corrections: [{ productId: 1, reason: "quantity_changed" }],
	},
	{
		_tag: "InvalidCheckoutDetails",
		message: "Захиалгын мэдээлэл дутуу эсвэл буруу байна.",
		fields: ["address"],
	},
	{
		_tag: "ProductUnavailable",
		message: "Сонгосон бараа одоогоор захиалах боломжгүй байна.",
		productId: 1,
	},
	{
		_tag: "InsufficientStock",
		message: "Зарим барааны үлдэгдэл хүрэлцэхгүй байна.",
		items: [
			{ productId: 1, productName: "Vitamin D", requested: 2, available: 1 },
		],
	},
	{
		_tag: "DeliveryUnavailable",
		message: "Хүргэлтийн мэдээллийг баталгаажуулж чадсангүй.",
	},
	{
		_tag: "CheckoutKeyConflict",
		message: "Энэ оролдлогын мэдээлэл өмнөх хүсэлтээс өөр байна.",
	},
	{
		_tag: "CheckoutRecoveryRequired",
		message: "Захиалга үүссэн боловч үргэлжлүүлэх холбоосыг бэлтгэж чадсангүй.",
		orderNumber: "OR1",
	},
];

const paymentErrors: PaymentError[] = [
	{ _tag: "PaymentNotFound", message: "Төлбөрийн мэдээлэл олдсонгүй." },
	{
		_tag: "PaymentAccessDenied",
		message: "Энэ төлбөрийн мэдээллийг харах эрхгүй байна.",
	},
	{
		_tag: "PaymentAlreadyConfirmed",
		message: "Төлбөр аль хэдийн баталгаажсан байна.",
	},
	{
		_tag: "PaymentNotPending",
		message: "Энэ төлбөр одоо хүлээгдэж буй төлөвт биш байна.",
		status: "failed",
	},
	{
		_tag: "PaymentMethodMismatch",
		message: "Сонгосон төлбөрийн хэлбэр тохирохгүй байна.",
		expected: "qpay",
		actual: "transfer",
	},
	{
		_tag: "PaymentProviderUnavailable",
		message: "Төлбөрийн үйлчилгээтэй холбогдож чадсангүй.",
		provider: "qpay",
		retryable: true,
		fallbackMethods: ["transfer"],
	},
	{
		_tag: "PaymentConfirmationConflict",
		message: "Төлбөрийг одоогоор баталгаажуулж чадсангүй.",
		retryable: true,
	},
	{
		_tag: "BankTransactionAlreadyConsumed",
		message: "Банкны гүйлгээг өөр төлбөрт ашигласан байна.",
	},
	{
		_tag: "ManualReviewRequired",
		message: "Төлбөрийг ажилтан гараар шалгах шаардлагатай байна.",
		paymentStatus: "pending",
	},
];

describe("commerce UI presentations", () => {
	test("maps every checkout and payment branch to safe recovery copy", () => {
		const presentations = [
			...checkoutErrors.map(checkoutErrorPresentation),
			...paymentErrors.map(paymentErrorPresentation),
		];
		for (const presentation of presentations) {
			expect(presentation.title.length).toBeGreaterThan(0);
			expect(presentation.description.length).toBeGreaterThan(0);
			expect(presentation.actions.length).toBeGreaterThan(0);
			expect(JSON.stringify(presentation)).not.toMatch(
				/stack|fingerprint|token|provider body/i,
			);
		}
	});

	test("does not offer another payment method for an ambiguous QPay check", () => {
		const presentation = paymentErrorPresentation({
			_tag: "PaymentProviderUnavailable",
			message: "Төлбөрийн үйлчилгээтэй холбогдож чадсангүй.",
			provider: "qpay",
			retryable: true,
			fallbackMethods: [],
		});
		expect(presentation.actions).toEqual(["retry"]);
		expect(presentation.actions).not.toContain("choose_transfer");
	});

	test("keeps ambiguous transfer reconciliation distinct and manual", () => {
		expect(reconciliationPresentation("ambiguous")).toEqual({
			manualReview: true,
			terminal: true,
		});
		expect(reconciliationPresentation("polling").manualReview).toBe(false);
	});
});

describe("public payment redaction", () => {
	test("strict contracts reject sensitive or provider-specific fields", () => {
		expect(
			v.safeParse(paymentErrorSchema, {
				...paymentErrors[0],
				fingerprint: "secret-hash",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(checkoutErrorSchema, {
				...checkoutErrors[0],
				stack: "private stack",
			}).success,
		).toBe(false);
		expect(
			v.safeParse(transferReconciliationSchema, {
				paymentNumber: "PAY1",
				status: "ambiguous",
				attempts: 1,
				startedAt: new Date(0).toISOString(),
				expiresAt: new Date(1).toISOString(),
				nextPollAt: null,
				lastError: null,
				matchedTransaction: { relatedAccount: "5000000000" },
			}).success,
		).toBe(false);
	});
});

describe("checkout browser replay key", () => {
	test("reuses one normalized-attempt key, rotates changes, and clears completed attempts", async () => {
		const values = new Map<string, string>();
		const storage = {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
			removeItem: (key: string) => values.delete(key),
		};
		let sequence = 0;
		const dependencies = {
			storage,
			randomUUID: () => `00000000-0000-4000-8000-00000000000${++sequence}`,
			digest: async (value: string) => value,
		};
		const input = {
			phoneNumber: "99112233",
			address: "Баянзүрх дүүрэг",
			addressZoneId: 1,
			notes: "",
			products: [
				{ productId: 1, quantity: 1 },
				{ productId: 1, quantity: 2 },
			],
		};
		const first = await addCheckoutIdempotency(input, dependencies);
		const replay = await addCheckoutIdempotency(
			{ ...input, products: [{ productId: 1, quantity: 3 }] },
			dependencies,
		);
		const changed = await addCheckoutIdempotency(
			{ ...input, address: "Сүхбаатар дүүрэг" },
			dependencies,
		);

		expect(replay.idempotencyKey).toBe(first.idempotencyKey);
		expect(changed.idempotencyKey).not.toBe(first.idempotencyKey);
		clearCheckoutIdempotency(storage);
		const nextAttempt = await addCheckoutIdempotency(
			{ ...input, address: "Сүхбаатар дүүрэг" },
			dependencies,
		);
		expect(nextAttempt.idempotencyKey).not.toBe(changed.idempotencyKey);
	});
});

describe("QPay webhook compatibility", () => {
	test("keeps the current acknowledgment statuses", () => {
		expect(qpayWebhookStatus({ _tag: "InvalidRequest" })).toBe(400);
		expect(qpayWebhookStatus({ _tag: "Acknowledged" })).toBe(200);
		expect(qpayWebhookStatus({ _tag: "ProviderAmbiguous" })).toBe(200);
		expect(qpayWebhookStatus({ _tag: "ProcessingFailed" })).toBe(200);
	});
});
