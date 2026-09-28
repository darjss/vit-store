import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import type { Cart } from "../src/cart";
import {
	buildCheckoutTools,
	type CheckoutToolDeps,
	type CreatedOrder,
} from "../src/checkout-tools";
import type { CheckoutOrderPayload, CheckoutState } from "../src/checkout";

const cart: Cart = {
	confirmed: true,
	items: [
		{
			productId: 10,
			name: "Vitamin D",
			price: 20_000,
			quantity: 2,
		},
	],
};

const zone = {
	zoneId: 1,
	zoneName: "Баянзүрх",
	score: 1,
	evidence: ["test"],
};

type Tool = ReturnType<typeof buildCheckoutTools>[number];

type HarnessOptions = {
	createOrder: CheckoutToolDeps["createOrder"];
};

const makeHarness = ({ createOrder }: HarnessOptions) => {
	let checkout: CheckoutState | undefined;
	let keySequence = 0;
	const deps: CheckoutToolDeps = {
		getCart: async () => cart,
		getCheckout: async () => checkout,
		saveCheckout: async (state) => {
			checkout = state;
			return state;
		},
		resolveZoneCandidates: async () => Result.ok([zone]),
		createOrder,
		sendText: async () => Result.ok(undefined),
		generateIdempotencyKey: () =>
			`checkout_00000000-0000-4000-8000-${String(++keySequence).padStart(12, "0")}`,
	};
	const tools = new Map<string, Tool>(
		buildCheckoutTools(deps).map((tool) => [tool.name, tool]),
	);
	const run = (name: string, input: Record<string, unknown> = {}) => {
		const tool = tools.get(name);
		if (!tool) throw new Error(`Missing tool: ${name}`);
		return (
			tool.run as (context: {
				input: Record<string, unknown>;
			}) => Promise<unknown>
		)({ input });
	};
	const ready = async () => {
		await run("begin_checkout");
		await run("provide_phone", { phone: "99112233" });
		await run("provide_address", { address: "Баянзүрх дүүрэг" });
	};
	return { checkout: () => checkout, ready, run };
};

const payloadIdentity = (payload: CheckoutOrderPayload) =>
	JSON.stringify({ ...payload, idempotencyKey: undefined });

const keyOf = (payload: CheckoutOrderPayload) =>
	(payload as CheckoutOrderPayload & { idempotencyKey?: string }).idempotencyKey;

describe("assistant checkout idempotency", () => {
	test("concurrent place_order calls commit one order", async () => {
		const records = new Map<string, { identity: string; order: CreatedOrder }>();
		let commits = 0;
		const harness = makeHarness({
			createOrder: async (payload) => {
				await Promise.resolve();
				const key = keyOf(payload);
				if (!key) {
					commits += 1;
					return Result.ok({
						orderNumber: `OR${commits}`,
						paymentNumber: `PAY${commits}`,
						checkoutToken: `token-${commits}`,
					});
				}
				const existing = records.get(key);
				if (existing) return Result.ok(existing.order);
				commits += 1;
				const order = {
					orderNumber: `OR${commits}`,
					paymentNumber: `PAY${commits}`,
					checkoutToken: `token-${commits}`,
				};
				records.set(key, { identity: payloadIdentity(payload), order });
				return Result.ok(order);
			},
		});
		await harness.ready();

		const [first, second] = await Promise.all([
			harness.run("place_order"),
			harness.run("place_order"),
		]);

		expect(commits).toBe(1);
		expect(first).toMatchObject({ ok: true, orderNumber: "OR1" });
		expect(second).toMatchObject({ ok: true, orderNumber: "OR1" });
	});

	test("the key rotates only when the normalized payload changes", async () => {
		const harness = makeHarness({
			createOrder: async () =>
				Result.ok({
					orderNumber: "OR1",
					paymentNumber: "PAY1",
					checkoutToken: "token-1",
				}),
		});
		await harness.ready();
		const firstKey = harness.checkout()?.attempt?.idempotencyKey;

		await harness.run("provide_address", {
			address: "  Баянзүрх дүүрэг  ",
		});
		const normalizedReplayKey = harness.checkout()?.attempt?.idempotencyKey;
		await harness.run("provide_address", {
			address: "Сүхбаатар дүүрэг",
		});
		const changedKey = harness.checkout()?.attempt?.idempotencyKey;

		expect(firstKey).toMatch(/^checkout_[0-9a-f-]{36}$/);
		expect(normalizedReplayKey).toBe(firstKey);
		expect(changedKey).not.toBe(firstKey);
	});

	test("an ambiguous outcome retries with the persisted key", async () => {
		const seenKeys: Array<string | undefined> = [];
		let calls = 0;
		const committed = {
			orderNumber: "OR1",
			paymentNumber: "PAY1",
			checkoutToken: "token-1",
		};
		const harness = makeHarness({
			createOrder: async (payload) => {
				calls += 1;
				seenKeys.push(keyOf(payload));
				return calls === 1
					? Result.err({
							_tag: "OrderCreationFailed",
							retryable: true,
							recovery: { _tag: "Retry" },
						})
					: Result.ok(committed);
			},
		});
		await harness.ready();

		const ambiguous = await harness.run("place_order");
		const replay = await harness.run("place_order");

		expect(ambiguous).toMatchObject({
			ok: false,
			error: { _tag: "OrderCreationFailed", retryable: true },
		});
		expect(replay).toMatchObject({
			ok: true,
			orderNumber: committed.orderNumber,
			paymentNumber: committed.paymentNumber,
		});
		expect(seenKeys).toHaveLength(2);
		expect(seenKeys[0]).toMatch(/^checkout_[0-9a-f-]{36}$/);
		expect(seenKeys[1]).toBe(seenKeys[0]);
		expect(harness.checkout()?.phase).toBe("created");
	});
});
