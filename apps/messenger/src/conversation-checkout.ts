import {
	isCartClearPayload,
	isIncompleteUbAddress,
	listingKey,
	parseDeliveryChangePayload,
	parseIcePayload,
	parseOrderConfirmPayload,
	parseOrderEditPayload,
	parseOrderPayload,
	type CartLine,
	type IcePayload,
} from "./cart";
import type { ConversationIO } from "./conversation-io";
import { PAYMENT_DEADLINE_MS } from "./conversation-payments";
import type { Checkout, InboxRow, Payment } from "./conversation-store";
import {
	ASK_PRODUCT,
	CART_CHANGED,
	CART_EMPTY,
	DELIVERY_INFO,
	EDIT_PROMPT,
	ERROR,
	formatItemSelected,
	formatOrderCreated,
	MESSENGER_BANK_TRANSFER,
	NEEDS_ADDRESS,
	NEEDS_APT,
	NEEDS_DELIVERY,
	NEEDS_PHONE,
	type MissingDeliveryField,
} from "./copy";
import { errorFields, log, logError } from "./log";
import { storeClient, withTimeout } from "./store";
import type { CartItemInput } from "./tools";

export const cartReplace = async (
	io: ConversationIO,
	items: Array<CartItemInput>,
): Promise<void> => {
	if (items.length === 0) {
		io.store.clearCart();
		return;
	}
	for (const item of items) {
		if (!io.store.isProductKnown(item.productId)) {
			throw new Error("product_not_seen: search the product before adding it to cart");
		}
	}
	const uniqueIds = [...new Set(items.map((i) => i.productId))];
	const products = await storeClient(io.env).product.getProductsByIdsForAssistant.query(
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
	io.store.replaceCart([...merged.values()]);
};

const missingDeliveryField = (checkout: Checkout): MissingDeliveryField | undefined => {
	if (checkout.phone === undefined && checkout.address === undefined) {
		return "both";
	}
	if (checkout.phone === undefined) {
		return "phone";
	}
	if (checkout.address === undefined) {
		return "address";
	}
	return undefined;
};

const needsDeliveryText = (missing: MissingDeliveryField): string =>
	missing === "phone" ? NEEDS_PHONE : missing === "address" ? NEEDS_ADDRESS : NEEDS_DELIVERY;

const resolveCartLines = async (io: ConversationIO): Promise<Array<CartLine>> => {
	const lines = io.store.cartLines();
	if (lines.length > 0) {
		return lines;
	}
	const lastShown = Number(io.store.getMeta("last_shown_product_id") ?? "0");
	if (!Number.isSafeInteger(lastShown) || lastShown <= 0 || !io.store.isProductKnown(lastShown)) {
		return [];
	}
	try {
		await cartReplace(io, [{ productId: lastShown, quantity: 1 }]);
		return io.store.cartLines();
	} catch {
		return [];
	}
};

export const sendConfirmOrNeed = async (io: ConversationIO, key: string): Promise<void> => {
	const lines = await resolveCartLines(io);
	if (lines.length === 0) {
		await io.sendPart(key, { message: CART_EMPTY });
		return;
	}
	const checkout = io.store.checkout();
	const missing = missingDeliveryField(checkout);
	if (missing !== undefined || checkout.phone === undefined || checkout.address === undefined) {
		await io.sendPart(key, { message: needsDeliveryText(missing ?? "both") });
		return;
	}
	if (!checkout.countryside && isIncompleteUbAddress(checkout.address, checkout.note)) {
		await io.sendPart(key, { message: NEEDS_APT });
		return;
	}
	if (io.store.getMeta("delivery_source") !== "user") {
		await io.sendPart(key, {
			message: `Өмнөх хаяг (${checkout.address}, ${checkout.phone}) руугаа авах уу?`,
		});
		io.store.recordConfirmSent(checkout.revision);
		return;
	}
	const existing = io.store.paymentByRevision(checkout.revision);
	if (existing !== undefined) {
		await sendOrderCreated(io, existing, `${key}:order`, lines);
		return;
	}
	await createOrder(
		io,
		key,
		{ ...checkout, address: checkout.address, phone: checkout.phone },
		lines,
	);
};

const sendOrderCreated = async (
	io: ConversationIO,
	row: Payment,
	key: string,
	items?: Array<CartLine>,
): Promise<void> => {
	await io.sendPart(key, {
		message: formatOrderCreated({
			accountName: MESSENGER_BANK_TRANSFER.accountName,
			accountNumber: MESSENGER_BANK_TRANSFER.accountNumber,
			countryside: row.countryside,
			items: items?.map((l) => ({ name: l.name, price: l.price, qty: l.qty })) ?? row.items,
			orderNumber: row.orderNumber,
			phone: row.phone,
			total: row.total,
		}),
	});
};

const createOrder = async (
	io: ConversationIO,
	key: string,
	checkout: Checkout & { address: string; phone: string },
	lines: Array<CartLine>,
): Promise<void> => {
	try {
		const res = await storeClient(io.env).order.addOrder.mutate(
			{
				address: checkout.address,
				notes: checkout.note,
				payAfterDelivery: !checkout.countryside,
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
		const row = io.store.upsertPayment({
			accountName: MESSENGER_BANK_TRANSFER.accountName,
			accountNumber: MESSENGER_BANK_TRANSFER.accountNumber,
			checkoutToken: res.checkoutToken,
			countryside: checkout.countryside,
			createdAt: now,
			deadline: now + PAYMENT_DEADLINE_MS,
			items: lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
			orderNumber: res.orderNumber,
			paymentNumber: res.paymentNumber,
			phone: checkout.phone,
			revision: checkout.revision,
			total: res.total,
		});
		io.store.clearCart();
		io.store.clearLastOutbound();
		io.store.deleteMeta("delivery_source");
		io.store.deleteMeta("last_shown_product_id");
		await sendOrderCreated(io, row, `${key}:order`, lines);
		log({
			countryside: checkout.countryside,
			event: "order",
			items: lines.length,
			order_number: res.orderNumber,
			outcome: "created",
			payment_number: res.paymentNumber,
			thread: io.thread,
			total: res.total,
		});
	} catch (error) {
		logError({
			countryside: checkout.countryside,
			error: errorFields(error),
			event: "order",
			items: lines.length,
			outcome: "error",
			thread: io.thread,
		});
		const itemSummary = lines.map((l) => `${l.name} ×${l.qty}`).join(", ");
		await io.handoffToAdmin("order_create_failed", `${key}:tap`, [
			`Бараа: ${itemSummary}`,
			`Утас: ${checkout.phone} · Хаяг: ${checkout.address}`,
		]);
	}
};

export const confirmOrder = async (
	io: ConversationIO,
	key: string,
	revision: number,
	source: "button" | "text",
): Promise<void> => {
	const existing = io.store.paymentByRevision(revision);
	if (existing !== undefined) {
		await sendOrderCreated(io, existing, `${key}:order`);
		io.tapLog(`order_confirm_${source}`, "resent");
		return;
	}
	const checkout = io.store.checkout();
	if (revision !== checkout.revision) {
		await io.sendPart(`${key}:tap`, { message: CART_CHANGED });
		await sendConfirmOrNeed(io, `${key}:confirm`);
		io.tapLog(`order_confirm_${source}`, "stale");
		return;
	}
	const lines = io.store.cartLines();
	if (lines.length === 0) {
		await io.sendPart(`${key}:tap`, { message: CART_EMPTY });
		io.tapLog(`order_confirm_${source}`, "empty");
		return;
	}
	const missing = missingDeliveryField(checkout);
	if (missing !== undefined) {
		await io.sendPart(`${key}:tap`, { message: needsDeliveryText(missing) });
		io.tapLog(`order_confirm_${source}`, "needs_delivery");
		return;
	}
	if (checkout.phone === undefined || checkout.address === undefined) {
		return;
	}
	await createOrder(
		io,
		key,
		{ ...checkout, address: checkout.address, phone: checkout.phone },
		lines,
	);
};

const orderProductTap = async (
	io: ConversationIO,
	row: InboxRow,
	productId: number,
): Promise<void> => {
	const key = row.event_id;
	let selected: { name: string; price: number } | undefined;
	if (row.status !== "applied") {
		try {
			const products = await storeClient(io.env).product.getProductsByIdsForAssistant.query(
				{ ids: [productId] },
				{ signal: withTimeout() },
			);
			const found = products.find((p) => p.id === productId);
			if (found === undefined || found.stockStatus === "out_of_stock") {
				throw new Error(found === undefined ? "product_not_found" : "product_out_of_stock");
			}
			selected = found;
		} catch (error) {
			io.tapLog("order_product", error instanceof Error ? error.message : "failed");
			await io.sendPart(`${key}:tap`, { message: ERROR });
			return;
		}
		const targetKey = listingKey(selected.name);
		const duplicateIds = io.store
			.cartLines()
			.filter((l) => l.productId !== productId && listingKey(l.name) === targetKey)
			.map((l) => l.productId);
		io.store.markSeen([productId]);
		io.store.upsertCartItem(
			{ name: selected.name, price: selected.price, productId, qty: 1 },
			duplicateIds,
		);
		io.store.markInboxApplied(key);

		const ads = await io.adProducts();
		if (ads.length > 0 && !ads.some((a) => a.id === productId)) {
			io.markAdPivoted();
		}
	} else {
		selected = io.store.cartLines().find((l) => l.productId === productId);
	}

	if (io.store.hasNewerPendingInbox(row.seq)) {
		io.tapLog("order_product", "added_deferred");
		return;
	}
	const missing = missingDeliveryField(io.store.checkout());
	if (missing === undefined) {
		await sendConfirmOrNeed(io, `${key}:tap`);
	} else if (selected !== undefined) {
		await io.sendPart(`${key}:tap`, { message: formatItemSelected(selected.price, missing) });
	} else {
		await io.sendPart(`${key}:tap`, { message: needsDeliveryText(missing) });
	}
	io.tapLog("order_product", "added");
};

const orderEditTap = async (io: ConversationIO, key: string, revision: number): Promise<void> => {
	const checkout = io.store.checkout();
	if (revision !== checkout.revision) {
		await io.sendPart(`${key}:tap`, { message: CART_CHANGED });
		await sendConfirmOrNeed(io, `${key}:confirm`);
		io.tapLog("order_edit", "stale");
		return;
	}
	io.store.clearLastOutbound();
	await io.sendPart(`${key}:tap`, {
		message: EDIT_PROMPT,
		quickReplies: [
			{ payload: `delivery_change:${checkout.revision}`, title: "📍 Хаяг солих" },
			{ payload: "cart_clear", title: "🗑 Сагс хоослох" },
		],
	});
	io.tapLog("order_edit", "sent");
};

const deliveryChangeTap = async (
	io: ConversationIO,
	row: InboxRow,
	revision: number,
): Promise<void> => {
	const key = row.event_id;
	if (row.status !== "applied") {
		if (revision !== io.store.checkout().revision) {
			await io.sendPart(`${key}:tap`, { message: CART_CHANGED });
			await sendConfirmOrNeed(io, `${key}:confirm`);
			io.tapLog("delivery_change", "stale");
			return;
		}
		io.store.clearDelivery();
		io.store.clearLastOutbound();
		io.store.markInboxApplied(key);
	}
	await io.sendPart(`${key}:tap`, { message: NEEDS_DELIVERY });
	io.tapLog("delivery_change", "cleared");
};

const cartClearTap = async (io: ConversationIO, row: InboxRow): Promise<void> => {
	const key = row.event_id;
	if (row.status !== "applied") {
		io.store.clearCart();
		io.store.clearLastOutbound();
		io.store.markInboxApplied(key);
	}
	await io.sendPart(`${key}:tap`, { message: CART_EMPTY });
	io.tapLog("cart_clear", "cleared");
};

const iceTap = async (io: ConversationIO, row: InboxRow, ice: IcePayload): Promise<void> => {
	const key = `${row.event_id}:tap`;
	if (ice === "ice:delivery") {
		await io.sendPart(key, { message: DELIVERY_INFO });
		io.tapLog(ice, "sent");
		return;
	}
	if (row.status === "applied") {
		await sendConfirmOrNeed(io, key);
		return;
	}
	const ids = (await io.adProducts()).map((p) => p.id);
	const [only] = ids;
	if (ice === "ice:order" && only !== undefined && ids.length === 1) {
		await orderProductTap(io, row, only);
		return;
	}
	if (ids.length === 0) {
		await io.sendPart(key, { message: ASK_PRODUCT });
		io.tapLog(ice, "no_ad_product");
		return;
	}
	if (await io.sendCards(ids, key)) {
		io.store.markSeen(ids.slice(0, 10));
	}
	io.tapLog(ice, "cards");
};

export const handleTap = async (
	io: ConversationIO,
	row: InboxRow,
	payload: string,
): Promise<void> => {
	const confirmRev = parseOrderConfirmPayload(payload);
	if (confirmRev !== undefined) {
		await confirmOrder(io, row.event_id, confirmRev, "button");
		return;
	}
	const editRev = parseOrderEditPayload(payload);
	if (editRev !== undefined) {
		await orderEditTap(io, row.event_id, editRev);
		return;
	}
	const deliveryRev = parseDeliveryChangePayload(payload);
	if (deliveryRev !== undefined) {
		await deliveryChangeTap(io, row, deliveryRev);
		return;
	}
	if (isCartClearPayload(payload)) {
		await cartClearTap(io, row);
		return;
	}
	const productId = parseOrderPayload(payload);
	if (productId !== undefined) {
		await orderProductTap(io, row, productId);
		return;
	}
	const ice = parseIcePayload(payload);
	if (ice !== undefined) {
		await iceTap(io, row, ice);
		return;
	}
	io.tapLog(payload, "unknown");
};
