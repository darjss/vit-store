import type { MessengerMessagingEvent } from "@flue/messenger";
import {
	type AiOperationError,
	type AssistantProduct,
	type Cart,
	type CartCommand,
	parseCartPayload,
	parseOrderPayload,
} from "@vit/assistant";
import type { DeliveryFailure } from "@vit/shared";
import { Result, type Result as BetterResult } from "better-result";
import type { CartSession } from "./cart-session";

export type CartEvent =
	| { kind: "add"; productId: number; mid: string }
	| { kind: "command"; command: CartCommand; mid: string };

type CatalogFailure = Extract<
	AiOperationError,
	{ _tag: "ProviderUnavailable" }
>;

const payloadFromEvent = (
	event: MessengerMessagingEvent,
): { payload: string; mid: string } | undefined => {
	const stableMid = (payload: string, mid?: string) =>
		mid && mid.length > 0 ? mid : `syn:${event.timestamp ?? 0}:${payload}`;
	if (event.postback?.payload) {
		return {
			payload: event.postback.payload,
			mid: stableMid(event.postback.payload, event.postback.mid),
		};
	}
	const quickReply = event.message?.quick_reply?.payload;
	if (quickReply) {
		return {
			payload: quickReply,
			mid: stableMid(quickReply, event.message?.mid),
		};
	}
	return undefined;
};

export const detectCartEvent = (event: MessengerMessagingEvent) => {
	if (event.message?.is_echo) return undefined;
	const found = payloadFromEvent(event);
	if (!found) return undefined;

	const orderId = parseOrderPayload(found.payload);
	if (orderId !== undefined) {
		return { kind: "add", productId: orderId, mid: found.mid } as const;
	}
	const command = parseCartPayload(found.payload);
	if (command !== undefined) {
		return { kind: "command", command, mid: found.mid } as const;
	}
	return undefined;
};

export interface CartEventDeps {
	cart: CartSession;
	resolveProduct: (
		id: number,
	) => Promise<BetterResult<AssistantProduct | undefined, CatalogFailure>>;
	sendCartSummary: (
		cart: Cart,
	) => Promise<BetterResult<unknown, DeliveryFailure>>;
	sendText: (text: string) => Promise<BetterResult<unknown, DeliveryFailure>>;
}

const PRODUCT_GONE_MESSAGE =
	"Уучлаарай, энэ бараа одоо боломжгүй байна. Өөр бараа сонгоно уу.";

/** Marks an unknown failure after the cart mutation commit point. */
export class CartPostcommitError extends Error {
	constructor() {
		super("Cart postcommit delivery failed.");
		this.name = "CartPostcommitError";
	}
}

const sendAfterCommit = async (
	send: () => Promise<BetterResult<unknown, DeliveryFailure>>,
) => {
	let result: BetterResult<unknown, DeliveryFailure>;
	try {
		result = await send();
	} catch {
		// Keep the dedupe claim when an unknown sender defect occurs after the
		// mutation. A provider retry must not apply the cart command twice.
		throw new CartPostcommitError();
	}
	if (result.status === "error") {
		console.warn("[cart] postcommit delivery failed", {
			error_tag: result.error._tag,
			provider: result.error.provider,
			code: result.error.code,
		});
	}
};

export const handleCartEvent = async (
	event: CartEvent,
	deps: CartEventDeps,
): Promise<BetterResult<Cart, CatalogFailure>> => {
	if (event.kind === "add") {
		const resolved = await deps.resolveProduct(event.productId);
		if (resolved.status === "error") {
			return Result.err<Cart, CatalogFailure>(resolved.error);
		}
		const product = resolved.value;
		if (!product) {
			const cart = await deps.cart.getCart();
			await sendAfterCommit(() => deps.sendText(PRODUCT_GONE_MESSAGE));
			return Result.ok(cart);
		}
		const cart = await deps.cart.addProduct(product);
		await sendAfterCommit(() => deps.sendCartSummary(cart));
		return Result.ok(cart);
	}

	const cart = await deps.cart.applyCommand(event.command);
	await sendAfterCommit(() => deps.sendCartSummary(cart));
	return Result.ok(cart);
};
