import { defineTool } from "@flue/runtime";
import * as v from "valibot";
import {
	type Cart,
	type CartCommand,
	cartItemCount,
	cartSubtotal,
	formatCartSummary,
} from "./cart";

// Conversational cart tools for the customer assistant. The model uses these to
// view and edit the cart by natural language ("make it 3", "remove the omega",
// "confirm my order") — the parallel deterministic path is the Messenger cart
// buttons/quick-replies wired in the channel, which need no model at all.
//
// Persistence is injected (`CartToolDeps`): the agent app binds these to the
// per-session cart Durable Object (ADR 0006), so this stays channel-neutral and
// unit-testable without a worker. `applyCommand` must apply atomically on the
// store so concurrent turns cannot clobber each other.
export interface CartToolDeps {
	getCart: () => Promise<Cart>;
	applyCommand: (command: CartCommand) => Promise<Cart>;
	// Sends the rendered summary out on the bound channel (mirrors how the
	// product-search tool sends cards itself), so the model does not have to
	// re-type the cart contents into a separate reply.
	sendCartSummary: (cart: Cart) => Promise<unknown>;
}

const cartFacts = (cart: Cart) => ({
	itemCount: cartItemCount(cart),
	subtotal: cartSubtotal(cart),
	confirmed: cart.confirmed,
	items: cart.items.map((item) => ({
		productId: item.productId,
		name: item.name,
		price: item.price,
		quantity: item.quantity,
	})),
});

const respond = (cart: Cart) => ({
	summary: formatCartSummary(cart),
	...cartFacts(cart),
});

export const buildCartTools = (deps: CartToolDeps) => {
	const sendAndReport = async (cart: Cart) => {
		await deps.sendCartSummary(cart);
		return respond(cart);
	};

	const viewCart = defineTool({
		name: "view_cart",
		description:
			"Show the customer their current shopping cart: every item with quantity, unit price, line total, and the subtotal. Call this whenever the customer asks what is in their cart or to review their order before confirming. Sends the cart summary to the customer directly.",
		input: v.object({}),
		async run() {
			return sendAndReport(await deps.getCart());
		},
	});

	const updateCartItem = defineTool({
		name: "update_cart_item",
		description:
			"Set the quantity of a product already in the cart to an absolute number. Use when the customer asks to change how many of an item they want (e.g. 'make it 3'). A quantity of 0 removes the item. The productId must be one already shown in the cart.",
		input: v.object({
			productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
			quantity: v.pipe(v.number(), v.integer(), v.minValue(0)),
		}),
		async run({ input }) {
			const cart = await deps.applyCommand({
				kind: "set",
				productId: input.productId,
				quantity: input.quantity,
			});
			return sendAndReport(cart);
		},
	});

	const removeCartItem = defineTool({
		name: "remove_cart_item",
		description:
			"Remove a product from the cart entirely. Use when the customer asks to drop or delete an item. The productId must be one already shown in the cart.",
		input: v.object({
			productId: v.pipe(v.number(), v.integer(), v.minValue(1)),
		}),
		async run({ input }) {
			const cart = await deps.applyCommand({
				kind: "remove",
				productId: input.productId,
			});
			return sendAndReport(cart);
		},
	});

	const confirmCartTool = defineTool({
		name: "confirm_cart",
		description:
			"Mark the cart as confirmed once the customer has EXPLICITLY agreed to place the order (e.g. they said yes/confirm). This is the checkout gate: only call it on an explicit confirmation, never preemptively. Order creation itself happens in a later step.",
		input: v.object({}),
		async run() {
			const cart = await deps.applyCommand({ kind: "confirm" });
			return sendAndReport(cart);
		},
	});

	return [viewCart, updateCartItem, removeCartItem, confirmCartTool];
};
