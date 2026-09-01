import type { Cart, CartCommand, CartProductInput } from "@vit/assistant";
import { EMPTY_CART } from "@vit/assistant";

// Thin client over the per-session CartStore Durable Object. Both the
// deterministic button path (channel webhook) and the conversational model
// tools (agent) go through this same client keyed by the assistant session id,
// so they share one authoritative cart per conversation.

export interface CartSession {
	addProduct: (product: CartProductInput, quantity?: number) => Promise<Cart>;
	applyCommand: (command: CartCommand) => Promise<Cart>;
	getCart: () => Promise<Cart>;
}

type CartStoreNamespace = {
	get(id: DurableObjectId): { fetch: typeof fetch };
	idFromName(name: string): DurableObjectId;
};

// Internal URL; only the path/method/body matter to the DO.
const DO_URL = "https://cart-store/cart";

const readCart = async (response: Response): Promise<Cart> => {
	const body = (await response.json()) as { cart?: Cart };
	return body.cart ?? { ...EMPTY_CART };
};

// Builds a cart session bound to a Durable Object instance for `sessionId`.
// Returns `undefined` when the binding is absent (e.g. a mock/test env with no
// CART_STORE) so callers can degrade instead of throwing.
export const cartSessionFor = (
	namespace: CartStoreNamespace | undefined,
	sessionId: string,
): CartSession | undefined => {
	if (!namespace) {
		return undefined;
	}
	const stub = namespace.get(namespace.idFromName(sessionId));

	const post = async (payload: unknown): Promise<Cart> => {
		const response = await stub.fetch(DO_URL, {
			body: JSON.stringify(payload),
			headers: { "content-type": "application/json" },
			method: "POST",
		});
		if (!response.ok) {
			throw new Error(`cart store request failed (${response.status})`);
		}
		return readCart(response);
	};

	return {
		addProduct(product, quantity) {
			return post({ product, quantity, type: "add" });
		},
		applyCommand(command) {
			return post({ command, type: "command" });
		},
		async getCart() {
			const response = await stub.fetch(DO_URL, { method: "GET" });
			if (!response.ok) {
				throw new Error(`cart store request failed (${response.status})`);
			}
			return readCart(response);
		},
	};
};
