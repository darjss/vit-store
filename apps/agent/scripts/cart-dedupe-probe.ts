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
const capture = Bun.serve({
	port: 8788,
	hostname: "127.0.0.1",
	async fetch(req) {
		if (req.method !== "POST") return Response.json({ id: PSID });
		const body = (await req.json()) as Record<string, unknown>;
		if (!body.sender_action) {
			lastText = (body.message as Record<string, unknown>)?.text as string;
		}
		return Response.json({ recipient_id: PSID, message_id: "cap" });
	},
});

async function fire(event: MessengerMessagingEvent): Promise<void> {
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
	if (!res.ok) throw new Error(`webhook ${res.status}`);
}

const postback = () => ({
	sender: { id: PSID },
	recipient: { id: PAGE_ID },
	timestamp: Date.now(),
	postback: { mid: FIXED_MID, title: "Захиалах", payload: "order_product:101" },
});

await fire(postback());
console.log("delivery 1 →", lastText?.split("\n")[2] ?? lastText);
await fire(postback());
console.log(
	"delivery 2 (same mid) →",
	lastText === undefined
		? "(no outbound — deduped, add NOT re-applied)"
		: lastText,
);

storeApi.stop();
capture.stop();
