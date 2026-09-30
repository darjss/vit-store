// Proves the cart add is idempotent under a Meta webhook retry: the SAME mid
// delivered twice applies the add only once (admission claim, mid-keyed).
// Real worker + real CartStore DO; stub store API + capture as in cart-demo.
import { createHmac } from "node:crypto";
import type { MessengerMessagingEvent, MessengerWebhookPayload } from "@flue/messenger";
import * as v from "valibot";
import { SuperJSON } from "superjson";
import { graphSendBodySchema } from "../cli/graph-send";
import { trpcResponse } from "../cli/trpc-stub";

const idsInputSchema = v.object({ ids: v.optional(v.array(v.number())) });

const APP_SECRET = "dev-app-secret";
const PAGE_ID = "DEV_PAGE_ID";
const PSID = `DEDUPE_PSID_${Date.now().toString(36)}`;
const WEBHOOK = "http://127.0.0.1:3583/channels/messenger/webhook";
const FIXED_MID = `dedupe-mid-${Date.now().toString(36)}`;

const storeApi = Bun.serve({
	fetch(req) {
		const raw = new URL(req.url).searchParams.get("input");
		const ids = raw
			? (v.parse(idsInputSchema, SuperJSON.deserialize(JSON.parse(decodeURIComponent(raw)))).ids ??
				[])
			: [];
		const data = ids.includes(101)
			? [
					{
						brand: "NOW Foods",
						id: 101,
						image: "",
						name: "Magnesium Glycinate 400mg",
						price: 54_900,
						slug: "magnesium-glycinate-400",
						stockStatus: "in_stock",
					},
				]
			: [];
		return new Response(trpcResponse(data), {
			headers: { "content-type": "application/json" },
		});
	},
	hostname: "127.0.0.1",
	port: 3000,
});

let lastText: string | undefined;
// When true, the next real message send (the cart summary) is rejected with a
// 400 — simulating Meta's Send API failing AFTER the DO mutation has committed.
let failNextSend = false;
const capture = Bun.serve({
	async fetch(req) {
		if (req.method !== "POST") {
			return Response.json({ id: PSID });
		}
		const body = v.parse(graphSendBodySchema, await req.json());
		if (body.sender_action) {
			return Response.json({ message_id: "cap", recipient_id: PSID });
		}
		if (failNextSend) {
			failNextSend = false;
			return Response.json(
				{ error: { code: 400, message: "simulated send failure" } },
				{ status: 400 },
			);
		}
		lastText = body.message?.text;
		return Response.json({ message_id: "cap", recipient_id: PSID });
	},
	hostname: "127.0.0.1",
	port: 8788,
});

// Returns the webhook HTTP status (does not throw) so we can assert the worker
// stays 200 even when the post-commit send fails.
async function fire(event: MessengerMessagingEvent): Promise<number> {
	const payload: MessengerWebhookPayload = {
		entry: [{ id: PAGE_ID, messaging: [event], time: Date.now() }],
		object: "page",
	};
	const bodyText = JSON.stringify(payload);
	const sig = createHmac("sha256", APP_SECRET).update(bodyText).digest("hex");
	lastText = undefined;
	const res = await fetch(WEBHOOK, {
		body: bodyText,
		headers: {
			"content-type": "application/json",
			"x-hub-signature-256": `sha256=${sig}`,
		},
		method: "POST",
	});
	return res.status;
}

const addPostback = () => ({
	postback: { mid: FIXED_MID, payload: "order_product:101", title: "Захиалах" },
	recipient: { id: PAGE_ID },
	sender: { id: PSID },
	timestamp: Date.now(),
});

const viewQuickReply = () => ({
	message: {
		mid: `view-${Date.now().toString(36)}`,
		quick_reply: { payload: "cart_view" },
		text: "view",
	},
	recipient: { id: PAGE_ID },
	sender: { id: PSID },
	timestamp: Date.now(),
});

const qtyOf = (summary: string | undefined): string => summary?.match(/×\s*(\d+)/)?.[1] ?? "?";

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
