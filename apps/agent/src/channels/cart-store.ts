import {
	addToCart,
	applyCartCommand,
	assistantStockStatusSchema,
	type Cart,
	cartCommandSchema,
	cartSchema,
	EMPTY_CART,
} from "@vit/assistant";
import { literal, number, object, optional, safeParse, string, variant } from "valibot";

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
const addRequestSchema = object({
	product: object({
		brand: optional(string()),
		id: number(),
		image: optional(string()),
		name: string(),
		price: number(),
		stockStatus: optional(assistantStockStatusSchema),
	}),
	quantity: optional(number()),
	type: literal("add"),
});

const commandRequestSchema = object({
	command: cartCommandSchema,
	type: literal("command"),
});

const cartRequestSchema = variant("type", [addRequestSchema, commandRequestSchema]);

export class CartStore implements DurableObject {
	constructor(private readonly state: DurableObjectState) {}

	private async read(): Promise<Cart> {
		const stored = await this.state.storage.get(STORAGE_KEY);
		if (stored === undefined) {
			return { ...EMPTY_CART };
		}
		// Tolerate a legacy/garbled record by falling back to an empty cart rather
		// than throwing the customer's whole turn.
		const parsed = safeParse(cartSchema, stored);
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
		const parsed = safeParse(cartRequestSchema, body);
		if (!parsed.success) {
			return new Response("Invalid cart request", { status: 400 });
		}

		const current = await this.read();
		const next =
			parsed.output.type === "add"
				? addToCart(current, parsed.output.product, parsed.output.quantity)
				: applyCartCommand(current, parsed.output.command);
		await this.write(next);
		return Response.json({ cart: next });
	}
}
