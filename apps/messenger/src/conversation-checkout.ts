import {
	isCartClearPayload,
	listingKey,
	parseDeliveryChangePayload,
	parseIcePayload,
	parseOrderConfirmPayload,
	parseOrderEditPayload,
	parseOrderPayload,
	type CartLine,
	type IcePayload,
} from "./cart";
import {
	ASK_PRODUCT,
	CART_CHANGED,
	CART_EMPTY,
	CONFIRM_PROMPT,
	DELIVERY_INFO,
	EDIT_PROMPT,
	ERROR,
	formatConfirmSummary,
	formatItemSelected,
	formatOrderCreated,
	NEEDS_DELIVERY,
	TRANSFER_PROMPT,
} from "./copy";
import { PAYMENT_DEADLINE_MS } from "./conversation-payments";
import type { CheckoutRow, ConversationStore, InboxRow, PaymentDbRow } from "./conversation-store";
import type { Env } from "./env";
import { errorFields, log, logError } from "./log";
import { sendCards } from "./render";
import { storeClient, withTimeout } from "./store";
import type { AdProduct, CartItemInput } from "./tools";
import type { ZernioSendBody } from "./zernio";

type CheckoutHost = {
	accountId(): string;
	adProducts(): Promise<Array<AdProduct>>;
	conversationId(): string;
	ensurePaymentWatch(paymentNumber: string): Promise<void>;
	env: Env;
	markAdPivoted(): void;
	sendPart(key: string, body: Omit<ZernioSendBody, "accountId">): Promise<void>;
	store: ConversationStore;
	thread(): string;
};

// Owns deterministic cart mutations, card/confirm/edit/ice taps, confirmation
// summaries, and order creation. The model never creates orders or computes totals.
export class CheckoutCoordinator {
	private readonly host: CheckoutHost;

	constructor(host: CheckoutHost) {
		this.host = host;
	}

	async cartReplace(items: Array<CartItemInput>): Promise<void> {
		if (items.length === 0) {
			this.host.store.clearCart();
			return;
		}
		for (const item of items) {
			if (!this.host.store.isProductKnown(item.productId)) {
				throw new Error("product_not_seen: search the product before adding it to cart");
			}
		}
		const uniqueIds = [...new Set(items.map((i) => i.productId))];
		const products = await storeClient(this.host.env).product.getProductsByIdsForAssistant.query(
			{ ids: uniqueIds },
			{ signal: withTimeout() },
		);
		const byId = new Map(products.map((p) => [p.id, p]));
		const merged = new Map<number, CartLine>();
		for (const item of items) {
			const product = byId.get(item.productId);
			if (product === undefined) {
				throw new Error(`product_not_found:${item.productId}`);
			}
			if (product.stockStatus === "out_of_stock") {
				throw new Error(`product_out_of_stock:${item.productId}`);
			}
			const prev = merged.get(item.productId);
			merged.set(item.productId, {
				name: product.name,
				price: product.price,
				productId: product.id,
				qty: Math.min((prev?.qty ?? 0) + item.quantity, 20),
			});
		}
		this.host.store.replaceCart([...merged.values()]);
	}

	async handleTap(row: InboxRow, payload: string): Promise<void> {
		const key = row.event_id;
		const confirmRev = parseOrderConfirmPayload(payload);
		if (confirmRev !== undefined) {
			await this.confirmOrder(key, confirmRev, "button");
			return;
		}
		const editRev = parseOrderEditPayload(payload);
		if (editRev !== undefined) {
			await this.orderEditTap(key, editRev);
			return;
		}
		const deliveryChangeRev = parseDeliveryChangePayload(payload);
		if (deliveryChangeRev !== undefined) {
			await this.deliveryChangeTap(row, deliveryChangeRev);
			return;
		}
		if (isCartClearPayload(payload)) {
			await this.cartClearTap(row);
			return;
		}
		const productId = parseOrderPayload(payload);
		if (productId !== undefined) {
			await this.orderProductTap(row, productId);
			return;
		}
		const ice = parseIcePayload(payload);
		if (ice !== undefined) {
			await this.iceTap(row, ice);
			return;
		}
		this.tapLog(payload, "unknown");
	}

	async sendConfirmOrNeed(key: string): Promise<void> {
		const lines = this.host.store.cartLines();
		const checkout = this.host.store.checkoutRow();
		if (lines.length === 0) {
			await this.host.sendPart(key, { message: CART_EMPTY });
			return;
		}
		if (checkout.phone === null || checkout.address === null) {
			await this.host.sendPart(key, { message: NEEDS_DELIVERY });
			return;
		}
		await this.host.sendPart(key, {
			message: formatConfirmSummary({
				address: checkout.address,
				items: lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
				note: checkout.note ?? undefined,
				phone: checkout.phone,
			}),
		});
		await this.host.sendPart(`${key}:btn`, {
			buttons: [
				{ payload: `order_confirm:${checkout.revision}`, title: "✅ Захиалах", type: "postback" },
				{ payload: `order_edit:${checkout.revision}`, title: "✏️ Засах", type: "postback" },
			],
			message: CONFIRM_PROMPT,
		});
		this.host.store.recordConfirmSent(checkout.revision);
	}

	async confirmOrder(key: string, revision: number, source: "button" | "text"): Promise<void> {
		const existing = this.host.store.paymentByRevision(revision);
		if (existing !== undefined) {
			await this.host.ensurePaymentWatch(existing.payment_number);
			await this.sendOrderCreated(existing, `${key}:order`);
			this.tapLog(`order_confirm_${source}`, "resent");
			return;
		}
		const checkout = this.host.store.checkoutRow();
		if (revision !== checkout.revision) {
			await this.host.sendPart(`${key}:tap`, { message: CART_CHANGED });
			await this.sendConfirmOrNeed(`${key}:confirm`);
			this.tapLog(`order_confirm_${source}`, "stale");
			return;
		}
		const lines = this.host.store.cartLines();
		if (lines.length === 0) {
			await this.host.sendPart(`${key}:tap`, { message: CART_EMPTY });
			this.tapLog(`order_confirm_${source}`, "empty");
			return;
		}
		if (checkout.phone === null || checkout.address === null) {
			await this.host.sendPart(`${key}:tap`, { message: NEEDS_DELIVERY });
			this.tapLog(`order_confirm_${source}`, "needs_delivery");
			return;
		}
		await this.createOrder(key, checkout, lines);
	}

	private async createOrder(
		key: string,
		checkout: CheckoutRow,
		lines: Array<CartLine>,
	): Promise<void> {
		if (checkout.phone === null || checkout.address === null) {
			return;
		}
		try {
			const res = await storeClient(this.host.env).order.addOrder.mutate(
				{
					address: checkout.address,
					notes: checkout.note ?? undefined,
					payAfterDelivery: checkout.countryside === 0,
					paymentProvider: "transfer",
					phoneNumber: checkout.phone,
					products: lines.map((l) => ({ productId: l.productId, quantity: l.qty })),
				},
				{ signal: withTimeout() },
			);
			if (res.paymentNumber === null) {
				throw new Error("no_payment_number");
			}
			const now = Date.now();
			const row = this.host.store.upsertPayment({
				accountName: res.accountName,
				accountNumber: res.accountNumber,
				checkoutToken: res.checkoutToken,
				countryside: checkout.countryside,
				createdAt: now,
				deadline: now + PAYMENT_DEADLINE_MS,
				orderNumber: res.orderNumber,
				paymentNumber: res.paymentNumber,
				phone: checkout.phone,
				revision: checkout.revision,
				total: res.total,
			});
			this.host.store.clearCart();
			this.host.store.clearLastOutbound();
			await this.host.ensurePaymentWatch(res.paymentNumber);
			await this.sendOrderCreated(row, `${key}:order`);
			log({
				countryside: checkout.countryside === 1,
				event: "order",
				items: lines.length,
				order_number: res.orderNumber,
				outcome: "created",
				payment_number: res.paymentNumber,
				thread: this.host.thread(),
				total: res.total,
			});
		} catch (error) {
			logError({
				countryside: checkout.countryside === 1,
				error: errorFields(error),
				event: "order",
				items: lines.length,
				outcome: "error",
				thread: this.host.thread(),
			});
			await this.host.sendPart(`${key}:tap`, { message: ERROR });
		}
	}

	private async sendOrderCreated(row: PaymentDbRow, key: string): Promise<void> {
		await this.host.sendPart(key, {
			message: formatOrderCreated({
				accountName: row.account_name ?? "",
				accountNumber: row.account_number ?? "",
				countryside: row.countryside === 1,
				orderNumber: row.order_number,
				phone: row.phone,
				total: row.total,
			}),
		});
		// Countryside prepays right away so it keeps the immediate button; UB pays
		// on delivery (button arrives on TU delivered push or payment(details)).
		if (row.countryside === 1) {
			await this.host.sendPart(`${key}:btn`, {
				buttons: [
					{
						payload: `transfer_done:${row.payment_number}`,
						title: "Шилжүүлсэн",
						type: "postback",
					},
				],
				message: TRANSFER_PROMPT,
			});
		}
	}

	private async orderProductTap(row: InboxRow, productId: number): Promise<void> {
		const key = row.event_id;
		let selected: { name: string; price: number } | undefined;
		if (row.status !== "applied") {
			try {
				const products = await storeClient(
					this.host.env,
				).product.getProductsByIdsForAssistant.query(
					{ ids: [productId] },
					{ signal: withTimeout() },
				);
				const found = products.find((p) => p.id === productId);
				if (found === undefined || found.stockStatus === "out_of_stock") {
					throw new Error(found === undefined ? "product_not_found" : "product_out_of_stock");
				}
				selected = found;
			} catch (error) {
				this.tapLog("order_product", error instanceof Error ? error.message : "failed");
				await this.host.sendPart(`${key}:tap`, { message: ERROR });
				return;
			}

			// Append distinct items (37.7% of real orders are multi-item); only replace
			// a duplicate catalog twin with the same normalized listingKey.
			const targetKey = listingKey(selected.name);
			const duplicateIds = this.host.store
				.cartLines()
				.filter((l) => l.productId !== productId && listingKey(l.name) === targetKey)
				.map((l) => l.productId);
			this.host.store.markSeen([productId]);
			this.host.store.upsertCartItem(
				{ name: selected.name, price: selected.price, productId, qty: 1 },
				duplicateIds,
			);
			this.host.store.markInboxApplied(key);

			const ads = await this.host.adProducts();
			if (ads.length > 0 && !ads.some((a) => a.id === productId)) {
				this.host.markAdPivoted();
			}
		} else {
			selected = this.host.store.cartLines().find((l) => l.productId === productId);
		}

		const checkout = this.host.store.checkoutRow();
		if (checkout.phone !== null && checkout.address !== null) {
			await this.sendConfirmOrNeed(`${key}:tap`);
		} else if (selected !== undefined) {
			await this.host.sendPart(`${key}:tap`, {
				message: formatItemSelected(selected.name, selected.price),
			});
		} else {
			await this.host.sendPart(`${key}:tap`, { message: NEEDS_DELIVERY });
		}
		this.tapLog("order_product", "added");
	}

	private async orderEditTap(key: string, revision: number): Promise<void> {
		const checkout = this.host.store.checkoutRow();
		if (revision !== checkout.revision) {
			await this.host.sendPart(`${key}:tap`, { message: CART_CHANGED });
			await this.sendConfirmOrNeed(`${key}:confirm`);
			this.tapLog("order_edit", "stale");
			return;
		}
		this.host.store.clearLastOutbound();
		await this.host.sendPart(`${key}:tap`, {
			message: EDIT_PROMPT,
			quickReplies: [
				{ payload: `delivery_change:${checkout.revision}`, title: "📍 Хаяг солих" },
				{ payload: "cart_clear", title: "🗑 Сагс хоослох" },
			],
		});
		this.tapLog("order_edit", "sent");
	}

	private async deliveryChangeTap(row: InboxRow, revision: number): Promise<void> {
		const key = row.event_id;
		if (row.status !== "applied") {
			if (revision !== this.host.store.checkoutRow().revision) {
				await this.host.sendPart(`${key}:tap`, { message: CART_CHANGED });
				await this.sendConfirmOrNeed(`${key}:confirm`);
				this.tapLog("delivery_change", "stale");
				return;
			}
			this.host.store.clearDelivery();
			this.host.store.clearLastOutbound();
			this.host.store.markInboxApplied(key);
		}
		await this.host.sendPart(`${key}:tap`, { message: NEEDS_DELIVERY });
		this.tapLog("delivery_change", "cleared");
	}

	private async cartClearTap(row: InboxRow): Promise<void> {
		const key = row.event_id;
		if (row.status !== "applied") {
			this.host.store.clearCart();
			this.host.store.clearLastOutbound();
			this.host.store.markInboxApplied(key);
		}
		await this.host.sendPart(`${key}:tap`, { message: CART_EMPTY });
		this.tapLog("cart_clear", "cleared");
	}

	private async iceTap(row: InboxRow, ice: IcePayload): Promise<void> {
		const key = `${row.event_id}:tap`;
		if (ice === "ice:delivery") {
			await this.host.sendPart(key, { message: DELIVERY_INFO });
			this.tapLog(ice, "sent");
			return;
		}
		if (row.status === "applied") {
			await this.sendConfirmOrNeed(key);
			return;
		}
		const ids = (await this.host.adProducts()).map((p) => p.id);
		const [only] = ids;
		if (ice === "ice:order" && only !== undefined && ids.length === 1) {
			await this.orderProductTap(row, only);
			return;
		}
		if (ids.length === 0) {
			await this.host.sendPart(key, { message: ASK_PRODUCT });
			this.tapLog(ice, "no_ad_product");
			return;
		}
		if (
			!this.host.store.outboxHas(key) &&
			(await sendCards({
				accountId: this.host.accountId(),
				conversationId: this.host.conversationId(),
				env: this.host.env,
				ids,
				key,
			}))
		) {
			this.host.store.markOutbox(key);
			this.host.store.markSeen(ids.slice(0, 10));
		}
		this.tapLog(ice, "cards");
	}

	private tapLog(kind: string, outcome: string): void {
		log({ event: "tap", kind, outcome, thread: this.host.thread() });
	}
}
