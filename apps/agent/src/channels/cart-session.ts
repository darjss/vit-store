import type { Cart, CartCommand, CartProductInput } from "@vit/assistant";
import { EMPTY_CART } from "@vit/assistant";

// Thin client over the per-session CartStore Durable Object. Both the
// deterministic button path (channel webhook) and the conversational model
// tools (agent) go through this same client keyed by the assistant session id,
// so they share one authoritative cart per conversation.

export interface CartSession {
	getCart: () => Promise<Cart>;
	addProduct: (product: CartProductInput, quantity?: number) => Promise<Cart>;
	applyCommand: (command: CartCommand) => Promise<Cart>;
}

type CartStoreNamespace = {
	idFromName(name: string): DurableObjectId;
	get(id: DurableObjectId): { fetch: typeof fetch };
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
	if (!namespace) return undefined;
	const stub = namespace.get(namespace.idFromName(sessionId));

	const post = async (payload: unknown): Promise<Cart> => {
		const response = await stub.fetch(DO_URL, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			throw new Error(`cart store request failed (${response.status})`);
		}
		return readCart(response);
	};

	return {
		async getCart() {
			const response = await stub.fetch(DO_URL, { method: "GET" });
			if (!response.ok) {
				throw new Error(`cart store request failed (${response.status})`);
			}
			return readCart(response);
		},
		addProduct(product, quantity) {
			return post({ type: "add", product, quantity });
		},
		applyCommand(command) {
			return post({ type: "command", command });
		},
	};
};
