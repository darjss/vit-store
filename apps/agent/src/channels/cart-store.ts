import {
	addToCart,
	applyCartCommand,
	type Cart,
	type CartCommand,
	type CartProductInput,
	cartSchema,
	EMPTY_CART,
} from "@vit/assistant";
import * as v from "valibot";

// Per-session cart persistence (ADR 0006: pre-order Messenger conversations live
// only in the Flue agent session, keyed by PSID — no customer row until an
// order). One Durable Object instance per assistant session id (the channel
// derives the id with `idFromName(sessionId)`), so the cart survives across
// turns for the whole conversation and is read/written the same way by the
// deterministic button path (channel webhook) and the model tools (agent).
//
// All state transitions reuse the pure cart reducers from `@vit/assistant`, so
// the DO holds zero cart business logic — it is just durable storage plus an
// atomic apply. Requests are serialized per instance by the Durable Object
// runtime, so a read-modify-write here is race-free without extra locking.

const STORAGE_KEY = "cart";

// Wire payloads accepted on POST. `add` carries the resolved product snapshot
// (the channel resolves the catalog before calling); `command` carries a parsed
// cart-control command (inc/dec/set/remove/confirm/clear/view).
const addRequestSchema = v.object({
	type: v.literal("add"),
	product: v.object({
		id: v.number(),
		name: v.string(),
		price: v.number(),
		image: v.optional(v.string()),
		brand: v.optional(v.string()),
		stockStatus: v.optional(
			v.picklist(["in_stock", "low_stock", "out_of_stock"]),
		),
	}),
	quantity: v.optional(v.number()),
});

const commandRequestSchema = v.object({
	type: v.literal("command"),
	command: v.custom<CartCommand>(
		(value) => typeof value === "object" && value !== null && "kind" in value,
	),
});

const cartRequestSchema = v.variant("type", [
	addRequestSchema,
	commandRequestSchema,
]);

export class CartStore implements DurableObject {
	constructor(private readonly state: DurableObjectState) {}

	private async read(): Promise<Cart> {
		const stored = await this.state.storage.get(STORAGE_KEY);
		if (stored === undefined) return { ...EMPTY_CART };
		// Tolerate a legacy/garbled record by falling back to an empty cart rather
		// than throwing the customer's whole turn.
		const parsed = v.safeParse(cartSchema, stored);
		return parsed.success ? parsed.output : { ...EMPTY_CART };
	}

	private async write(cart: Cart): Promise<void> {
		await this.state.storage.put(STORAGE_KEY, cart);
	}

	async fetch(request: Request): Promise<Response> {
		if (request.method === "GET") {
			return Response.json({ cart: await this.read() });
		}
		if (request.method === "DELETE") {
			await this.state.storage.delete(STORAGE_KEY);
			return Response.json({ cart: { ...EMPTY_CART } });
		}
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return new Response("Invalid JSON", { status: 400 });
		}
		const parsed = v.safeParse(cartRequestSchema, body);
		if (!parsed.success) {
			return new Response("Invalid cart request", { status: 400 });
		}

		const current = await this.read();
		const next =
			parsed.output.type === "add"
				? addToCart(
						current,
						parsed.output.product as CartProductInput,
						parsed.output.quantity,
					)
				: applyCartCommand(current, parsed.output.command);
		await this.write(next);
		return Response.json({ cart: next });
	}
}
