// Proves the cart add is idempotent under a Meta webhook retry: the SAME mid
// delivered twice applies the add only once (admission claim, mid-keyed).
// Real worker + real CartStore DO; stub store API + capture as in cart-demo.
import { createHmac } from "node:crypto";
import type {
	MessengerMessagingEvent,
	MessengerWebhookPayload,
} from "@flue/messenger";
import { SuperJSON } from "superjson";

const APP_SECRET = "dev-app-secret";
const PAGE_ID = "DEV_PAGE_ID";
const PSID = `DEDUPE_PSID_${Date.now().toString(36)}`;
const WEBHOOK = "http://127.0.0.1:3583/channels/messenger/webhook";
const FIXED_MID = `dedupe-mid-${Date.now().toString(36)}`;

const storeApi = Bun.serve({
	port: 3000,
	hostname: "127.0.0.1",
	fetch(req) {
		const raw = new URL(req.url).searchParams.get("input");
		const ids = raw
			? ((
					SuperJSON.deserialize(JSON.parse(decodeURIComponent(raw))) as {
						ids?: number[];
					}
				).ids ?? [])
			: [];
		const data = ids.includes(101)
			? [
					{
						id: 101,
						slug: "magnesium-glycinate-400",
						name: "Magnesium Glycinate 400mg",
						price: 54900,
						image: "",
						brand: "NOW Foods",
						stockStatus: "in_stock",
					},
				]
			: [];
		return new Response(
			JSON.stringify({ result: { data: SuperJSON.serialize(data) } }),
			{ headers: { "content-type": "application/json" } },
		);
	},
});

let lastText: string | undefined;
// When true, the next real message send (the cart summary) is rejected with a
// 400 — simulating Meta's Send API failing AFTER the DO mutation has committed.
let failNextSend = false;
const capture = Bun.serve({
	port: 8788,
	hostname: "127.0.0.1",
	async fetch(req) {
		if (req.method !== "POST") return Response.json({ id: PSID });
		const body = (await req.json()) as Record<string, unknown>;
		if (body.sender_action) {
			return Response.json({ recipient_id: PSID, message_id: "cap" });
		}
		if (failNextSend) {
			failNextSend = false;
			// 4xx → messenger-sdk throws immediately (no retry) → sendCartSummary
			// throws inside handleCartEvent.
			return Response.json(
				{ error: { message: "simulated send failure", code: 400 } },
				{ status: 400 },
			);
		}
		lastText = (body.message as Record<string, unknown>)?.text as string;
		return Response.json({ recipient_id: PSID, message_id: "cap" });
	},
});

// Returns the webhook HTTP status (does not throw) so we can assert the worker
// stays 200 even when the post-commit send fails.
async function fire(event: MessengerMessagingEvent): Promise<number> {
	const payload: MessengerWebhookPayload = {
		object: "page",
		entry: [{ id: PAGE_ID, time: Date.now(), messaging: [event] }],
	};
	const bodyText = JSON.stringify(payload);
	const sig = createHmac("sha256", APP_SECRET).update(bodyText).digest("hex");
	lastText = undefined;
	const res = await fetch(WEBHOOK, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-hub-signature-256": `sha256=${sig}`,
		},
		body: bodyText,
	});
	return res.status;
}

const addPostback = () => ({
	sender: { id: PSID },
	recipient: { id: PAGE_ID },
	timestamp: Date.now(),
	postback: { mid: FIXED_MID, title: "Захиалах", payload: "order_product:101" },
});

const viewQuickReply = () => ({
	sender: { id: PSID },
	recipient: { id: PAGE_ID },
	timestamp: Date.now(),
	message: {
		mid: `view-${Date.now().toString(36)}`,
		text: "view",
		quick_reply: { payload: "cart_view" },
	},
});

const qtyOf = (summary: string | undefined): string =>
	summary?.match(/×\s*(\d+)/)?.[1] ?? "?";

// HIGH-1 scenario: the add commits, then the summary send FAILS, then Meta
// re-delivers the SAME mid. The add must be applied exactly once.
failNextSend = true;
const status1 = await fire(addPostback());
console.log(
	`delivery 1 (add, send FAILS post-commit) → webhook HTTP ${status1}` +
		(status1 === 200 ? "  ✓ no 500, claim NOT released" : "  ✗ 500!"),
);

const status2 = await fire(addPostback());
console.log(
	`delivery 2 (Meta retry, same mid)        → webhook HTTP ${status2}  (deduped, no second add)`,
);

await fire(viewQuickReply());
console.log(`cart_view → ${lastText?.split("\n")[1] ?? lastText}`);
const qty = qtyOf(lastText);
console.log(
	`\nRESULT: qty = ${qty} → ${qty === "1" ? "PASS (applied once)" : "FAIL (double-applied)"}`,
);

storeApi.stop();
capture.stop();
