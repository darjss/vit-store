import { describe, expect, test } from "bun:test";
import type { newOrderType } from "@vit/shared";
import { Result } from "better-result";
import { executeCheckout } from "../src/operations/checkout/core";
import type {
	CheckoutOperationDependencies,
	NormalizedCheckout,
} from "../src/operations/checkout/core";
import type { CheckoutRecord } from "../src/queries/checkout";
import { executePaymentConfirmation } from "../src/lib/payments/payment-confirmation-core";
import { planStockTransition } from "../src/lib/stock/transition";
import { runPostCommitRecoveryWithDependencies } from "../src/lib/payments/post-commit-recovery-core";
import type {
	PaymentRecoveryEffect,
	PostCommitRecoveryDependencies,
} from "../src/lib/payments/post-commit-recovery-core";

const checkoutInput = (
	overrides: Partial<newOrderType> = {},
): newOrderType => ({
	phoneNumber: "99112233",
	address: "Баянзүрх дүүрэг 1-р хороо",
	addressZoneId: 1,
	notes: "Орцны код 12",
	products: [{ productId: 10, quantity: 2 }],
	idempotencyKey: "checkout_00000000-0000-4000-8000-000000000001",
	...overrides,
});

const customer = {
	id: 1,
	phone: 99112233,
	address: "Баянзүрх дүүрэг 1-р хороо",
	addressZoneId: 1,
	facebook_username: null,
	instagram_username: null,
	createdAt: new Date(0),
	updatedAt: null,
	deletedAt: null,
};

const fakeCheckout = (
	options: { failAccessOnce?: boolean; failPostCommit?: boolean } = {},
) => {
	const records = new Map<string, CheckoutRecord>();
	let commits = 0;
	let accessFailures = options.failAccessOnce ? 1 : 0;
	let sequence = 0;

	const dependencies: CheckoutOperationDependencies = {
		findByKeyHash: async (keyHash) => records.get(keyHash) ?? null,
		getProducts: async () => [
			{ id: 10, name: "Vitamin D", price: 20_000, stock: 8, status: "active" },
		],
		commit: async (input) => {
			// Let concurrent callers both finish their initial lookup before one
			// wins the unique-key insert.
			await Promise.resolve();
			if (input.keyHash && records.has(input.keyHash)) {
				throw Object.assign(new Error("unique"), { code: "23505" });
			}
			commits += 1;
			const record: CheckoutRecord = {
				keyHash: input.keyHash,
				requestHash: input.requestHash,
				notificationStatus: "pending",
				orderId: commits,
				orderNumber: input.orderNumber,
				paymentId: commits,
				paymentNumber: input.paymentNumber,
				total: input.total,
				customer,
			};
			if (input.keyHash) records.set(input.keyHash, record);
			return record;
		},
		createAccess: async () => {
			if (accessFailures > 0) {
				accessFailures -= 1;
				throw new Error("session unavailable");
			}
			return "checkout-token";
		},
		runPostCommit: async (
			_record: CheckoutRecord,
			_input: NormalizedCheckout,
		) => {
			if (options.failPostCommit) throw new Error("notification unavailable");
		},
		generateOrderNumber: () => `OR${++sequence}`,
		generatePaymentNumber: () => `PAY${sequence}`,
		accountNumber: "5000000000",
		accountName: "Vit Store",
	};

	return { dependencies, commits: () => commits };
};

describe("checkout idempotency", () => {
	test("same-key concurrent and later replays create one order and payment", async () => {
		const fake = fakeCheckout();
		const [first, concurrent] = await Promise.all([
			executeCheckout(checkoutInput(), fake.dependencies),
			executeCheckout(checkoutInput(), fake.dependencies),
		]);
		const replayed = await executeCheckout(checkoutInput(), fake.dependencies);

		expect(fake.commits()).toBe(1);
		expect(first.isOk()).toBe(true);
		const paymentNumber = first.isOk() ? first.value.paymentNumber : undefined;
		for (const result of [first, concurrent, replayed]) {
			expect(result.isOk()).toBe(true);
			if (result.isOk()) expect(result.value.paymentNumber).toBe(paymentNumber);
		}
	});

	test("equivalent duplicate cart lines replay the normalized request", async () => {
		const fake = fakeCheckout();
		const first = await executeCheckout(
			checkoutInput({
				products: [
					{ productId: 10, quantity: 1 },
					{ productId: 10, quantity: 1 },
				],
			}),
			fake.dependencies,
		);
		const replay = await executeCheckout(checkoutInput(), fake.dependencies);

		expect(first.isOk()).toBe(true);
		expect(replay.isOk()).toBe(true);
		expect(fake.commits()).toBe(1);
	});

	test("same key with a changed normalized request conflicts", async () => {
		const fake = fakeCheckout();
		await executeCheckout(checkoutInput(), fake.dependencies);
		const changed = await executeCheckout(
			checkoutInput({ address: "Сүхбаатар дүүрэг 2-р хороо" }),
			fake.dependencies,
		);

		expect(changed.isErr()).toBe(true);
		if (changed.isErr()) expect(changed.error._tag).toBe("CheckoutKeyConflict");
		expect(fake.commits()).toBe(1);
	});

	test("a committed response-loss replay returns the same order and payment", async () => {
		const fake = fakeCheckout({ failAccessOnce: true });
		const first = await executeCheckout(checkoutInput(), fake.dependencies);
		const replay = await executeCheckout(checkoutInput(), fake.dependencies);

		expect(first.isErr()).toBe(true);
		if (first.isErr()) {
			expect(first.error._tag).toBe("CheckoutRecoveryRequired");
			expect(first.error).toMatchObject({ orderNumber: "OR1" });
		}
		expect(replay.isOk()).toBe(true);
		if (replay.isOk()) {
			expect(replay.value.orderNumber).toBe("OR1");
			expect(replay.value.paymentNumber).toBe("PAY1");
		}
		expect(fake.commits()).toBe(1);
	});

	test("notification failure after commit remains public success", async () => {
		const fake = fakeCheckout({ failPostCommit: true });
		const result = await executeCheckout(checkoutInput(), fake.dependencies);
		expect(result.isOk()).toBe(true);
		expect(fake.commits()).toBe(1);
	});
});

const recoveryPayment = {
	paymentNumber: "PAY1",
	customerPhone: 99112233,
	orderNumber: "OR1",
	total: 46_000,
	address: "Баянзүрх",
	notes: null,
	productIds: [10],
	products: [{ name: "Vitamin D", quantity: 2, price: 20_000 }],
};

const recoveryDependencies = () => {
	const states = new Map<PaymentRecoveryEffect, string>();
	const claims = new Set<PaymentRecoveryEffect>();
	let sends = 0;
	const dependencies: PostCommitRecoveryDependencies = {
		loadPayment: async () => recoveryPayment,
		purgeCache: async () => false,
		sendMessenger: async () => {
			sends += 1;
			throw new Error("response lost");
		},
		trackAnalytics: async () => false,
		claim: async (_paymentNumber, effect) => {
			if (claims.has(effect)) return null;
			claims.add(effect);
			return `claim-${effect}`;
		},
		mark: async (_paymentNumber, effect, _token, status) => {
			states.set(effect, status);
		},
		persistMessengerFailure: async () => undefined,
	};
	return { dependencies, states, sends: () => sends };
};

describe("stock application", () => {
	test("keeps missing, inactive, and insufficient stock distinct", () => {
		const missing = planStockTransition(undefined, { productId: 1, delta: -1 });
		const inactive = planStockTransition(
			{ stock: 5, status: "draft" },
			{ productId: 1, delta: -1, requireActive: true },
		);
		const insufficient = planStockTransition(
			{ stock: 1, status: "active" },
			{ productId: 1, delta: -2, requireNonNegative: true },
		);

		expect(missing.isErr() && missing.error._tag).toBe("ProductNotFound");
		expect(inactive.isErr() && inactive.error._tag).toBe("ProductInactive");
		expect(insufficient.isErr() && insufficient.error._tag).toBe(
			"InsufficientStock",
		);
	});
});

describe("payment confirmation replay", () => {
	test("simultaneous confirmation commits once and every replay is public success", async () => {
		let committed = false;
		let recoveryRuns = 0;
		const dependencies = {
			commit: async () => {
				if (committed) {
					return Result.ok({
						outcome: "already_confirmed" as const,
						orderId: 1,
					});
				}
				committed = true;
				return Result.ok({ outcome: "confirmed" as const, orderId: 1 });
			},
			loadOrderNumber: async () => "OR1",
			recover: async () => {
				recoveryRuns += 1;
				return { recoveryPending: false };
			},
		};
		const [first, concurrent] = await Promise.all([
			executePaymentConfirmation(dependencies),
			executePaymentConfirmation(dependencies),
		]);
		const replay = await executePaymentConfirmation(dependencies);

		for (const result of [first, concurrent, replay]) {
			expect(result.isOk()).toBe(true);
			if (result.isOk()) expect(result.value.confirmed).toBe(true);
		}
		expect(
			[first, concurrent].filter(
				(result) => result.isOk() && result.value.newlyConfirmed,
			),
		).toHaveLength(1);
		expect(recoveryRuns).toBe(1);
	});

	test("a different-payment Khaan fingerprint conflict is tagged and redacted", async () => {
		const result = await executePaymentConfirmation({
			commit: async () =>
				Result.err({ _tag: "BankTransactionAlreadyConsumed" as const }),
			loadOrderNumber: async () => "OR1",
			recover: async () => ({ recoveryPending: false }),
		});

		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error._tag).toBe("BankTransactionAlreadyConsumed");
			expect(JSON.stringify(result.error)).not.toContain("fingerprint");
		}
	});
});

describe("payment post-commit recovery", () => {
	test("cache, notification, and analytics failures remain a persisted partial success", async () => {
		const fake = recoveryDependencies();
		const result = await runPostCommitRecoveryWithDependencies(
			{ paymentNumber: "PAY1", provider: "transfer" },
			fake.dependencies,
		);

		expect(result).toEqual({ recoveryPending: true });
		expect(fake.states).toEqual(
			new Map([
				["cache_purge", "pending"],
				["messenger_notification", "ambiguous"],
				["analytics", "pending"],
			]),
		);
	});

	test("concurrent recovery runners claim each effect once", async () => {
		const fake = recoveryDependencies();
		await Promise.all([
			runPostCommitRecoveryWithDependencies(
				{ paymentNumber: "PAY1", provider: "transfer" },
				fake.dependencies,
			),
			runPostCommitRecoveryWithDependencies(
				{ paymentNumber: "PAY1", provider: "transfer" },
				fake.dependencies,
			),
		]);
		expect(fake.sends()).toBe(1);
	});
});
