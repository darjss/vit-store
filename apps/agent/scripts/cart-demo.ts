// End-to-end cart proof against a REAL running worker.
//
// What is REAL here:
//   - the worker's signed Messenger webhook route (HMAC X-Hub-Signature-256),
//   - admission shaping + `detectCartEvent` routing,
//   - the per-session CartStore Durable Object (real DO read-modify-write),
//   - the pure `@vit/assistant` cart reducers + summary/quick-reply rendering,
//   - the real `src/lib/catalog.ts` by-id boundary fetch + SuperJSON + v.parse.
//
// What is SIMULATED (and why): the upstream catalog data source and Meta's
// Graph Send API. The store DB is not running locally, so a tiny stub tRPC
// server stands in for `product.getProductsByIdsForAssistant` (returns a fixed
// projection); the worker still performs the real fetch/deserialize/validate.
// Outbound Send API calls are captured by a local server (as the dev CLI does),
// so we can read back exactly what the worker sent — that captured summary IS
// the observable cart state after each transition. No model/LLM is involved on
// this path (so it runs under local miniflare where `env.AI` is unsupported).
//
// Usage: worker must be running on :3583, then `bun scripts/cart-demo.ts`.
import { createHmac } from "node:crypto";
import type {
	MessengerMessagingEvent,
	MessengerWebhookPayload,
} from "@flue/messenger";
import { SuperJSON } from "superjson";

const APP_SECRET = "dev-app-secret";
const PAGE_ID = "DEV_PAGE_ID";
const PSID = `DEMO_PSID_${Date.now().toString(36)}`;
const WORKER = "http://127.0.0.1:3583";
const WEBHOOK = `${WORKER}/channels/messenger/webhook`;

const PRODUCTS: Record<number, unknown> = {
	101: {
		id: 101,
		slug: "magnesium-glycinate-400",
		name: "Magnesium Glycinate 400mg",
		price: 54900,
		image: "https://cdn.vit.mn/p/101.jpg",
		brand: "NOW Foods",
		stockStatus: "in_stock",
	},
	202: {
		id: 202,
		slug: "omega-3-1000",
		name: "Omega-3 1000mg",
		price: 39900,
		image: "https://cdn.vit.mn/p/202.jpg",
		brand: "California Gold",
		stockStatus: "low_stock",
	},
};

// ── Stub store API (simulated catalog source) on :3000 ───────────────────────
const storeApi = Bun.serve({
	port: 3000,
	hostname: "127.0.0.1",
	fetch(req) {
		const url = new URL(req.url);
		const raw = url.searchParams.get("input");
		let ids: number[] = [];
		if (raw) {
			const input = SuperJSON.deserialize(
				JSON.parse(decodeURIComponent(raw)),
			) as { ids?: number[] };
			ids = input.ids ?? [];
		}
		const data = ids
			.map((id) => PRODUCTS[id])
			.filter((p): p is NonNullable<typeof p> => p != null);
		return new Response(
			JSON.stringify({ result: { data: SuperJSON.serialize(data) } }),
			{ headers: { "content-type": "application/json" } },
		);
	},
});

// ── Capture server (stands in for Graph Send API) on :8788 ───────────────────
type Captured = {
	text?: string;
	quickReplies: { title: string; payload: string }[];
};
let lastCapture: Captured | undefined;
const capture = Bun.serve({
	port: 8788,
	hostname: "127.0.0.1",
	async fetch(req) {
		if (req.method !== "POST") return Response.json({ id: PSID });
		const body = (await req.json()) as Record<string, unknown>;
		if (!body.sender_action) {
			const message = (body.message ?? {}) as Record<string, unknown>;
			const qr = Array.isArray(message.quick_replies)
				? (message.quick_replies as Record<string, unknown>[]).map((q) => ({
						title: String(q.title ?? ""),
						payload: String(q.payload ?? ""),
					}))
				: [];
			lastCapture = {
				text: message.text as string | undefined,
				quickReplies: qr,
			};
		}
		return Response.json({
			recipient_id: PSID,
			message_id: `cap-${Date.now().toString(36)}`,
		});
	},
});

// ── Signed webhook sender ────────────────────────────────────────────────────
let seq = 0;
const mid = () => `demo-mid-${++seq}-${Date.now().toString(36)}`;

async function post(event: MessengerMessagingEvent): Promise<void> {
	const payload: MessengerWebhookPayload = {
		object: "page",
		entry: [{ id: PAGE_ID, time: Date.now(), messaging: [event] }],
	};
	const bodyText = JSON.stringify(payload);
	const sig = createHmac("sha256", APP_SECRET).update(bodyText).digest("hex");
	lastCapture = undefined;
	const res = await fetch(WEBHOOK, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-hub-signature-256": `sha256=${sig}`,
		},
		body: bodyText,
	});
	if (!res.ok) throw new Error(`webhook ${res.status}: ${await res.text()}`);
}

const firePostback = (payload: string) =>
	post({
		sender: { id: PSID },
		recipient: { id: PAGE_ID },
		timestamp: Date.now(),
		postback: { mid: mid(), title: payload, payload },
	});

const fireQuickReply = (payload: string) =>
	post({
		sender: { id: PSID },
		recipient: { id: PAGE_ID },
		timestamp: Date.now(),
		message: { mid: mid(), text: payload, quick_reply: { payload } },
	});

function report(step: string): void {
	console.log(`\n=== ${step} ===`);
	if (!lastCapture) {
		console.log("  (no outbound captured)");
		return;
	}
	console.log(lastCapture.text ?? "(no text)");
	if (lastCapture.quickReplies.length > 0) {
		console.log(
			"  quick replies: " +
				lastCapture.quickReplies.map((q) => q.payload).join(", "),
		);
	}
}

async function main(): Promise<void> {
	console.log(`session psid=${PSID}`);
	await firePostback("order_product:101");
	report("ADD 101 (Захиалах postback)");
	await firePostback("order_product:101");
	report("ADD 101 again → qty merges to 2");
	await firePostback("order_product:202");
	report("ADD 202");
	await fireQuickReply("cart_inc:202");
	report("INC 202 → qty 2");
	await fireQuickReply("cart_dec:101");
	report("DEC 101 → qty 1");
	await fireQuickReply("cart_remove:202");
	report("REMOVE 202");
	await fireQuickReply("cart_confirm");
	report("CONFIRM (explicit checkout gate)");

	storeApi.stop();
	capture.stop();
	console.log("\ndone");
}

await main();
