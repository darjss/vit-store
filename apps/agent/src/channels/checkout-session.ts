import type { CheckoutState } from "@vit/assistant";

// Thin client over the per-session CheckoutStore Durable Object, keyed by the
// assistant session id — the same keying the CartStore uses — so the in-progress
// checkout shares one authoritative record per conversation.

export interface CheckoutSession {
	getCheckout: () => Promise<CheckoutState | undefined>;
	saveCheckout: (state: CheckoutState) => Promise<CheckoutState>;
}

type CheckoutStoreNamespace = {
	idFromName(name: string): DurableObjectId;
	get(id: DurableObjectId): { fetch: typeof fetch };
};

const DO_URL = "https://checkout-store/checkout";

const readCheckout = async (
	response: Response,
): Promise<CheckoutState | undefined> => {
	const body = (await response.json()) as { checkout?: CheckoutState | null };
	return body.checkout ?? undefined;
};

// Builds a checkout session bound to a Durable Object instance for `sessionId`.
// Returns `undefined` when the binding is absent (e.g. a mock/test env with no
// CHECKOUT_STORE) so callers can degrade instead of throwing.
export const checkoutSessionFor = (
	namespace: CheckoutStoreNamespace | undefined,
	sessionId: string,
): CheckoutSession | undefined => {
	if (!namespace) return undefined;
	const stub = namespace.get(namespace.idFromName(sessionId));

	return {
		async getCheckout() {
			const response = await stub.fetch(DO_URL, { method: "GET" });
			if (!response.ok) {
				throw new Error(`checkout store request failed (${response.status})`);
			}
			return readCheckout(response);
		},
		async saveCheckout(state) {
			const response = await stub.fetch(DO_URL, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ type: "put", state }),
			});
			if (!response.ok) {
				throw new Error(`checkout store request failed (${response.status})`);
			}
			const saved = await readCheckout(response);
			if (!saved) throw new Error("checkout store returned no state");
			return saved;
		},
	};
};
