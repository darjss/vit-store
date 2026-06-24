import type { MessengerMessagingEvent } from "@flue/messenger";
import {
	type AssistantProduct,
	type Cart,
	type CartCommand,
	parseCartPayload,
	parseOrderPayload,
} from "@vit/assistant";
import type { CartSession } from "./cart-session";

// Bridges Messenger button/quick-reply events to the cart WITHOUT the model.
// `Захиалах` (postback `order_product:<id>`) and the cart-control payloads
// (`cart_*`) are fully deterministic: the webhook resolves the catalog (for an
// add) and applies a pure cart reducer through the per-session CartStore DO,
// then sends the refreshed cart summary. No LLM turn is involved, so this whole
// flow runs under local miniflare where `env.AI` is unavailable.

export type CartEvent =
	| { kind: "add"; productId: number; mid: string }
	| { kind: "command"; command: CartCommand; mid: string };

const payloadFromEvent = (
	event: MessengerMessagingEvent,
): { payload: string; mid: string } | undefined => {
	if (event.postback?.payload) {
		return {
			payload: event.postback.payload,
			mid: event.postback.mid ?? "",
		};
	}
	const quickReply = event.message?.quick_reply?.payload;
	if (quickReply) {
		return { payload: quickReply, mid: event.message?.mid ?? "" };
	}
	return undefined;
};

// Classifies an incoming event as a cart event, or `undefined` when it is not
// one (a plain text turn, an echo, a non-cart postback) so the caller can fall
// through to the normal text-dispatch path.
export const detectCartEvent = (
	event: MessengerMessagingEvent,
): CartEvent | undefined => {
	if (event.message?.is_echo) return undefined;
	const found = payloadFromEvent(event);
	if (!found) return undefined;

	const orderId = parseOrderPayload(found.payload);
	if (orderId !== undefined) {
		return { kind: "add", productId: orderId, mid: found.mid };
	}
	const command = parseCartPayload(found.payload);
	if (command !== undefined) {
		return { kind: "command", command, mid: found.mid };
	}
	return undefined;
};

export interface CartEventDeps {
	cart: CartSession;
	// Resolves the catalog snapshot for an added product id (#19 projection).
	resolveProduct: (id: number) => Promise<AssistantProduct | undefined>;
	// Sends the cart summary (+ control quick replies) on the bound channel.
	sendCartSummary: (cart: Cart) => Promise<unknown>;
	// Soft text reply used when an added product can no longer be resolved.
	sendText: (text: string) => Promise<unknown>;
}

const PRODUCT_GONE_MESSAGE =
	"Уучлаарай, энэ бараа одоо боломжгүй байна. Өөр бараа сонгоно уу.";

// The DO mutation (addProduct/applyCommand) is the commit point and the webhook
// dedupe claim is held against it. A failure AFTER the commit must NOT propagate
// — otherwise the webhook 500s, the claim is released, and Meta's retry of the
// same mid re-applies the (non-idempotent) mutation, corrupting the cart. So the
// customer-facing send is best-effort past the commit: swallow + log, exactly
// like the typing indicator in `postMessage`. Only PRE-commit failures
// (resolveProduct) are allowed to throw, where a retry is safe.
const bestEffortSend = async (send: () => Promise<unknown>): Promise<void> => {
	try {
		await send();
	} catch (error) {
		console.warn(
			"[cart] post-commit send failed (cart state is durable):",
			error,
		);
	}
};

// Applies a detected cart event and sends the resulting summary. Returns the
// new cart (handy for tests/CLIs). Drives the whole add → view → adjust →
// confirm lifecycle deterministically.
export const handleCartEvent = async (
	event: CartEvent,
	deps: CartEventDeps,
): Promise<Cart> => {
	if (event.kind === "add") {
		// Pre-commit: a resolve failure may throw so the claim is released and the
		// retry can re-resolve (no mutation has happened yet).
		const product = await deps.resolveProduct(event.productId);
		if (!product) {
			await bestEffortSend(() => deps.sendText(PRODUCT_GONE_MESSAGE));
			return deps.cart.getCart();
		}
		const cart = await deps.cart.addProduct(product);
		await bestEffortSend(() => deps.sendCartSummary(cart));
		return cart;
	}

	const cart = await deps.cart.applyCommand(event.command);
	await bestEffortSend(() => deps.sendCartSummary(cart));
	return cart;
};
