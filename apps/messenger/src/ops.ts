import { isCountrysideAddress } from "./cart";
import { mnt } from "./copy";
import type { Env } from "./env";
import { errorFields, log, logError } from "./log";
import { squareImage } from "./render";
import { botClient, withTimeout } from "./store";
import { send, type ZernioSendBody } from "./zernio";

export const TSOGZOLMAA_ACCOUNT_ID = "6abf80aecb476a6db0a17892";
export const TSOGZOLMAA_CONVERSATION_ID = "8150131448402413";
// Only auto-dispatch orders created after our manual 01:11 UB batch on 2026-11-27.
export const DISPATCH_CUTOVER_MS = Date.parse("2026-11-26T17:15:00Z");
// Hold unpaid UB COD orders for 10 min before auto-dispatching to Tsogzolmaa
// so immediate buyer edits/cancellations land before packing.
const COD_DISPATCH_DELAY_MS = 10 * 60_000;
// For 2026-11-27 delivery, #1-#6 were already sent to Tsogzolmaa manually at 01:06-01:11 UB.
const SEEDED_SEQ_BY_DATE = new Map<string, number>([["2026-11-27", 6]]);

const UB_OFFSET_MS = 8 * 60 * 60_000;
const DIGEST_SLOTS: Array<{ hour: number; minute: number; slot: string }> = [
	{ hour: 11, minute: 30, slot: "11:30" },
	{ hour: 17, minute: 0, slot: "17:00" },
	{ hour: 22, minute: 0, slot: "22:00" },
];

export type DispatchableOrder = {
	address: string;
	createdAt: Date | string;
	customerPhone: string;
	notes: string | null;
	orderNumber: string;
	paymentProvider: string;
	paymentStatus: string;
	products: Array<{
		imageUrl?: string;
		name: string;
		price: number;
		productId: number;
		quantity: number;
	}>;
	status: string;
	total: number;
};

export type ActiveHandoffRow = {
	at: number;
	customer_name: string;
	reason: string;
	summary: string;
	thread_id: string;
};

export const ubClock = (now = Date.now()) => {
	const d = new Date(now + UB_OFFSET_MS);
	const y = d.getUTCFullYear();
	const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
	const day = String(d.getUTCDate()).padStart(2, "0");
	const h = d.getUTCHours();
	const m = d.getUTCMinutes();
	return {
		date: `${y}-${mo}-${day}`,
		hour: h,
		minute: m,
		mmdd: `${mo}/${day}`,
		time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
	};
};

export const seededSeqForDate = (ubDate: string): number => SEEDED_SEQ_BY_DATE.get(ubDate) ?? 0;

export const dueDigestSlot = (now = Date.now()): string | undefined => {
	const clock = ubClock(now);
	const currentMin = clock.hour * 60 + clock.minute;
	for (const s of DIGEST_SLOTS) {
		const target = s.hour * 60 + s.minute;
		if (currentMin >= target && currentMin < target + 15) {
			return `${clock.date}:${s.slot}`;
		}
	}
	return undefined;
};

const clip = (text: string, max: number) =>
	text.length <= max ? text : `${text.slice(0, max - 1)}…`;

const cleanProductName = (name: string): string =>
	name
		.replaceAll(/\s+/g, " ")
		.replace(/^([A-Za-z0-9'’.-]+(?:\s+[A-Za-z0-9'’.-]+)?)[,\s]+\1\b[,\s]*/i, "$1, ")
		.trim();

export const shouldAutoDispatchOrder = (order: DispatchableOrder, now = Date.now()): boolean => {
	if (order.status !== "pending") {
		return false;
	}
	const createdMs =
		order.createdAt instanceof Date ? order.createdAt.getTime() : Date.parse(order.createdAt);
	if (!Number.isFinite(createdMs) || createdMs < DISPATCH_CUTOVER_MS) {
		return false;
	}
	if (order.paymentStatus === "success") {
		return true;
	}
	if (order.paymentProvider === "qpay") {
		return false;
	}
	// Hold unpaid countryside orders until transfer clears; UB COD waits 10m for edits.
	return !isCountrysideAddress(order.address) && now - createdMs >= COD_DISPATCH_DELAY_MS;
};

export const formatPackerOrderText = (order: DispatchableOrder, seq: number): string => {
	const paid = order.paymentStatus === "success";
	const payLabel = paid
		? order.paymentProvider === "qpay"
			? "✅ Төлбөр төлөгдсөн (QPay)"
			: "✅ Төлбөр төлөгдсөн (шилжүүлэг)"
		: "Хүргэлт дээр шилжүүлнэ (төлөгдөөгүй)";
	const items = order.products.map(
		(p) => `• ${cleanProductName(p.name)} — ${p.quantity}ш (${mnt(p.price * p.quantity)})`,
	);
	const cleanAddress = order.address.trim().replaceAll(/\n+/g, " / ");
	const lines = [
		`${seq}. №${order.orderNumber}`,
		...items,
		`Нийт: ${mnt(order.total)} · ${payLabel}`,
		`Хаяг: ${cleanAddress}`,
		`Утас: ${order.customerPhone}`,
	];
	const note = order.notes?.trim();
	if (note) {
		lines.push(`Тэмдэглэл: ${note}`);
	}
	return lines.join("\n");
};

export const buildPackerCardsTemplate = (
	order: DispatchableOrder,
): ZernioSendBody["template"] | undefined => {
	if (order.products.length === 0) {
		return undefined;
	}
	return {
		elements: order.products.slice(0, 10).map((p) => ({
			imageUrl: p.imageUrl ? squareImage(p.imageUrl) : undefined,
			subtitle: clip(
				p.quantity > 1
					? `${p.quantity}ш × ${mnt(p.price)} = ${mnt(p.price * p.quantity)}`
					: `1ш · ${mnt(p.price)}`,
				80,
			),
			title: clip(cleanProductName(p.name), 80),
		})),
		imageAspectRatio: "square",
		type: "generic",
	};
};

export const sendOrderToPacker = async (
	env: Env,
	order: DispatchableOrder,
	seq: number,
): Promise<boolean> => {
	const text = formatPackerOrderText(order, seq);
	const keyBase = `tsog_auto:${order.orderNumber}`;
	try {
		await send(
			env,
			TSOGZOLMAA_CONVERSATION_ID,
			{ accountId: TSOGZOLMAA_ACCOUNT_ID, message: text },
			`${keyBase}:text`,
		);
		const template = buildPackerCardsTemplate(order);
		if (template !== undefined) {
			await send(
				env,
				TSOGZOLMAA_CONVERSATION_ID,
				{ accountId: TSOGZOLMAA_ACCOUNT_ID, template },
				`${keyBase}:cards`,
			);
		}
		log({
			event: "packer_dispatch",
			order_number: order.orderNumber,
			outcome: "sent",
			seq,
			total: order.total,
		});
		return true;
	} catch (error) {
		logError({
			error: errorFields(error),
			event: "packer_dispatch",
			order_number: order.orderNumber,
			outcome: "error",
			seq,
		});
		return false;
	}
};

export const formatMomDispatchNotice = (order: DispatchableOrder, seq: number): string => {
	const paid = order.paymentStatus === "success";
	const source =
		order.paymentProvider === "qpay"
			? "Вэб (QPay төлөгдсөн)"
			: paid
				? "Шилжүүлэг төлөгдсөн"
				: "Хүргэлт дээр шилжүүлнэ";
	const itemCount = order.products.reduce((s, p) => s + p.quantity, 0);
	return [
		`📤 Цогзолмаа руу #${seq} илгээлээ`,
		`№${order.orderNumber} · ${mnt(order.total)} (${itemCount}ш) · ${source}`,
		`Утас: ${order.customerPhone}`,
	].join("\n");
};

const REASON_LABELS = new Map<string, string>([
	["bot_failed", "Бот алдаа заасан"],
	["catalog_payment_quoted", "Каталогийн үнээр дүн + данс явууллаа"],
	["external_payment_details", "Гадны захиалгад данс асуулаа"],
	["external_transfer_claim", "Төлбөрийн баримт / мэдэгдэл ирлээ"],
	["handoff_followup", "Хэрэглэгч дахин бичлээ"],
	["handoff_followup_photo", "Хэрэглэгч зураг/баримт явууллаа"],
	["missing_item", "Бараа дутуу ирсэн"],
	["order_change", "Захиалга өөрчлөх / цуцлах"],
	["order_create_failed", "Захиалга үүсгэхэд алдаа гарлаа"],
	["order_not_in_bot", "Өмнө нь админд өгсөн захиалга шалгах"],
	["payment_ambiguous", "Олон төлбөр давхцсан"],
	["payment_total_unknown", "Захиалгын нийт дүнг баталгаажуулах"],
	["storepay_insist", "StorePay хүссэн (линк илгээсэн)"],
	["transfer_claim", "Шилжүүлсэн гэж мэдэгдлээ"],
	["wrong_item", "Буруу бараа ирсэн"],
]);

export const humanReasonLabel = (reason: string): string => REASON_LABELS.get(reason) ?? reason;

export const fetchTodayOrders = async (env: Env): Promise<Array<DispatchableOrder>> => {
	const client = botClient(env);
	if (client === undefined) {
		return [];
	}
	const res = await client.order.getPaginatedOrders.query(
		{ date: "today", page: 1, pageSize: 100 },
		{ signal: withTimeout() },
	);
	return res.orders;
};

export const fetchPendingOrders = async (env: Env): Promise<Array<DispatchableOrder>> => {
	const client = botClient(env);
	if (client === undefined) {
		return [];
	}
	const res = await client.order.getPaginatedOrders.query(
		{
			createdAfter: new Date(DISPATCH_CUTOVER_MS),
			orderStatus: "pending",
			page: 1,
			pageSize: 50,
		},
		{ signal: withTimeout() },
	);
	return res.orders;
};

export const formatDailySummary = (input: {
	dispatchedToday: number;
	handoffs: Array<ActiveHandoffRow>;
	lastPackerUpdate?: string;
	now?: number;
	orders: Array<DispatchableOrder>;
	unsentPending: number;
}): string => {
	const clock = ubClock(input.now);
	const totalValue = input.orders.reduce((s, o) => s + o.total, 0);
	const paidOrders = input.orders.filter((o) => o.paymentStatus === "success");
	const paidValue = paidOrders.reduce((s, o) => s + o.total, 0);
	const codCount = input.orders.length - paidOrders.length;
	const codValue = totalValue - paidValue;

	const lines = [
		`📊 Өнөөдрийн тайлан (${clock.mmdd} · ${clock.time})`,
		`• Нийт: ${input.orders.length} захиалга · ${mnt(totalValue)}`,
		`• Төлөгдсөн: ${paidOrders.length} (${mnt(paidValue)}) · Хүргэлт дээр: ${codCount} (${mnt(codValue)})`,
		"",
		"🚚 Цогзолмаа",
		`• Өнөөдөр илгээсэн: ${input.dispatchedToday} · Илгээгүй бэлэн: ${input.unsentPending}`,
	];
	if (input.lastPackerUpdate) {
		lines.push(`• Сүүлийн мэдээ: ${input.lastPackerUpdate}`);
	}
	lines.push("");
	if (input.handoffs.length === 0) {
		lines.push("✅ Ээжийн хариу хүлээж байгаа хүн алга.");
	} else {
		lines.push(`🔴 Ээжийн хариу хэрэгтэй (${input.handoffs.length} хүн):`);
		for (const [idx, h] of input.handoffs.slice(0, 8).entries()) {
			const t = ubClock(h.at).time;
			const desc = h.summary
				? `${humanReasonLabel(h.reason)} — ${h.summary}`
				: humanReasonLabel(h.reason);
			lines.push(`${idx + 1}. 👤 ${h.customer_name} (${t}): ${clip(desc, 75)}`);
		}
	}
	return lines.join("\n");
};

export const SUMMARY_INLINE_BUTTONS = [
	[
		{ callback_data: "ops_dispatch", text: "📤 Илгээгүйг Цогзолмаа руу илгээх" },
		{ callback_data: "ops_refresh", text: "🔄 Шинэчлэх" },
	],
];
