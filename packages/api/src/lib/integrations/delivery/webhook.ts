import { env } from "cloudflare:workers";
import { and, eq, isNull } from "drizzle-orm";
import * as v from "valibot";
import { db } from "~/db/client";
import { DeliveryDispatchesTable, OrdersTable } from "~/db/schema";
import {
	getTelegramAdminConfig,
	sendTelegramText,
} from "~/lib/integrations/admin-notifications/telegram";
import { logger } from "~/lib/logger";
import { parseCaught } from "~/lib/logging";

// Dalai / TU Delivery v3.2 Section 5 webhook contract.
const TU_WEBHOOK_MAX_DRIFT_SECONDS = 5 * 60;
const TELEGRAM_ALERT_TIMEOUT_MS = 5000;

export const tuWebhookStatusSchema = v.picklist([
	"awaiting_delivery",
	"on_transit",
	"picked_up",
	"delivered",
	"cancelled",
]);

export const tuWebhookPayloadSchema = v.looseObject({
	driverComment: v.optional(v.nullable(v.string())),
	driverName: v.optional(v.nullable(v.string())),
	getMoneyAmount: v.optional(v.nullable(v.number())),
	orderId: v.number(),
	orderNumber: v.string(),
	status: tuWebhookStatusSchema,
	statusName: v.optional(v.nullable(v.string())),
	updatedAt: v.optional(v.nullable(v.string())),
});

export type TuWebhookPayload = v.InferOutput<typeof tuWebhookPayloadSchema>;

const constantTimeEqual = (a: string, b: string): boolean => {
	const aBytes = new TextEncoder().encode(a);
	const bBytes = new TextEncoder().encode(b);
	if (aBytes.byteLength !== bBytes.byteLength) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < aBytes.byteLength; i++) {
		diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
	}
	return diff === 0;
};

export const verifyTuPathToken = (provided: string, expected: string): boolean =>
	expected.length > 0 && constantTimeEqual(provided, expected);

// Spec: sha256=HMAC_SHA256(secret, X-Timestamp + "." + rawBody), reject drift > 5 min.
export const verifyTuWebhookSignature = async (input: {
	nowSec?: number;
	rawBody: string;
	secret: string;
	signatureHeader: string | null;
	timestampHeader: string | null;
}): Promise<{ ok: true } | { ok: false; reason: string }> => {
	if (!input.timestampHeader || !input.signatureHeader) {
		return { ok: false, reason: "missing_headers" };
	}
	const ts = Number(input.timestampHeader);
	if (!Number.isInteger(ts)) {
		return { ok: false, reason: "invalid_timestamp" };
	}
	const nowSec = input.nowSec ?? Math.floor(Date.now() / 1000);
	if (Math.abs(nowSec - ts) > TU_WEBHOOK_MAX_DRIFT_SECONDS) {
		return { ok: false, reason: "timestamp_out_of_window" };
	}
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(input.secret),
		{ hash: "SHA-256", name: "HMAC" },
		false,
		["sign"],
	);
	const mac = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${input.timestampHeader}.${input.rawBody}`),
	);
	const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
	const expected = `sha256=${hex}`;
	if (!constantTimeEqual(expected, input.signatureHeader.trim().toLowerCase())) {
		return { ok: false, reason: "signature_mismatch" };
	}
	return { ok: true };
};

const normalizeOrderNumber = (raw: string): string => raw.trim().replace(/^AU-/i, "");

const findOrderForWebhook = async (payload: TuWebhookPayload) => {
	const database = db();
	const orderNumber = normalizeOrderNumber(payload.orderNumber);
	if (orderNumber.length > 0) {
		const [byNumber] = await database
			.select()
			.from(OrdersTable)
			.where(and(eq(OrdersTable.orderNumber, orderNumber), isNull(OrdersTable.deletedAt)))
			.limit(1);
		if (byNumber) {
			return byNumber;
		}
	}
	const [byTuId] = await database
		.select({ order: OrdersTable })
		.from(DeliveryDispatchesTable)
		.innerJoin(OrdersTable, eq(DeliveryDispatchesTable.orderId, OrdersTable.id))
		.where(
			and(eq(DeliveryDispatchesTable.tuOrderId, payload.orderId), isNull(OrdersTable.deletedAt)),
		)
		.limit(1);
	if (byTuId) {
		return byTuId.order;
	}
	const [byOrderId] = await database
		.select()
		.from(OrdersTable)
		.where(and(eq(OrdersTable.id, payload.orderId), isNull(OrdersTable.deletedAt)))
		.limit(1);
	return byOrderId ?? null;
};

const sendDeliveryErrorAlert = async (input: {
	address: string;
	driverComment: string | null;
	driverName: string | null;
	orderId: number;
	orderNumber: string;
	phone: number;
	statusName: string | null;
}): Promise<boolean> => {
	if (!getTelegramAdminConfig()) {
		return false;
	}
	const dashUrl = env.DASH_URL
		? `${env.DASH_URL.replace(/\/+$/, "")}/orders/${input.orderId}`
		: null;
	const lines = [
		`⚠️ TU хүргэлт амжилтгүй / цуцлагдлаа (#${input.orderNumber})`,
		`Утас: ${input.phone}`,
		`Хаяг: ${input.address}`,
		...(input.driverName ? [`Жолооч: ${input.driverName}`] : []),
		...(input.driverComment ? [`Тайлбар: ${input.driverComment}`] : []),
		...(input.statusName ? [`Төлөв: ${input.statusName}`] : []),
		...(dashUrl ? [dashUrl] : []),
	];
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			sendTelegramText(lines.join("\n")),
			new Promise<never>((_, reject) => {
				timer = setTimeout(
					() => reject(new Error("telegram_alert_timeout")),
					TELEGRAM_ALERT_TIMEOUT_MS,
				);
			}),
		]);
		return true;
	} catch (error) {
		logger.error("tu.webhook_alert_failed", parseCaught(error), {
			orderId: input.orderId,
			orderNumber: input.orderNumber,
		});
		return false;
	} finally {
		clearTimeout(timer);
	}
};

const trimOrNull = (value?: string | null): string | null => {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
};

const upsertDispatchState = async (input: {
	driverComment: string | null;
	driverName: string | null;
	eventKey: string;
	orderId: number;
	status: TuWebhookPayload["status"];
	statusName: string | null;
	tuOrderId: number;
	updatedAt: string | null;
}) => {
	const deliveryDate = input.updatedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
	const shared = {
		driverComment: input.driverComment,
		driverName: input.driverName,
		lastEventKey: input.eventKey,
		tuOrderId: input.tuOrderId,
		tuStatus: input.status,
		tuStatusName: input.statusName,
		tuUpdatedAt: input.updatedAt,
	};
	await db()
		.insert(DeliveryDispatchesTable)
		.values({
			...shared,
			deliveryDate,
			fingerprint: "webhook-only",
			orderId: input.orderId,
		})
		.onConflictDoUpdate({
			set: shared,
			target: DeliveryDispatchesTable.orderId,
		});
};

export const handleTuDeliveryWebhook = async (payload: TuWebhookPayload) => {
	const order = await findOrderForWebhook(payload);
	if (!order) {
		return { action: "unmatched" as const, orderId: null, orderNumber: payload.orderNumber };
	}

	const updatedAt = trimOrNull(payload.updatedAt);
	const eventKey = `${payload.orderId}:${payload.status}:${updatedAt ?? ""}`;
	const [existing] = await db()
		.select()
		.from(DeliveryDispatchesTable)
		.where(eq(DeliveryDispatchesTable.orderId, order.id))
		.limit(1);

	if (existing?.lastEventKey === eventKey) {
		return { action: "duplicate" as const, orderId: order.id, orderNumber: order.orderNumber };
	}
	if (existing?.tuUpdatedAt && updatedAt && updatedAt < existing.tuUpdatedAt) {
		return { action: "stale" as const, orderId: order.id, orderNumber: order.orderNumber };
	}

	const driverName = trimOrNull(payload.driverName);
	const driverComment = trimOrNull(payload.driverComment);
	const statusName = trimOrNull(payload.statusName);

	await upsertDispatchState({
		driverComment,
		driverName,
		eventKey,
		orderId: order.id,
		status: payload.status,
		statusName,
		tuOrderId: payload.orderId,
		updatedAt,
	});

	let orderStatusChanged = false;
	if (payload.status === "delivered" && order.status === "shipped") {
		await db()
			.update(OrdersTable)
			.set({ status: "delivered" })
			.where(and(eq(OrdersTable.id, order.id), eq(OrdersTable.status, "shipped")));
		orderStatusChanged = true;
	}

	// TU `cancelled` means failed delivery / driver return and can later revert
	// to `awaiting_delivery` if rescheduled; never auto-cancel a paid order.
	const alerted =
		payload.status === "cancelled"
			? await sendDeliveryErrorAlert({
					address: order.address,
					driverComment,
					driverName,
					orderId: order.id,
					orderNumber: order.orderNumber,
					phone: order.customerPhone,
					statusName,
				})
			: false;

	return {
		action: "processed" as const,
		alerted,
		orderId: order.id,
		orderNumber: order.orderNumber,
		orderStatusChanged,
		status: payload.status,
	};
};
