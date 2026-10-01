// Synthetic Zernio `message.received` sender for local wrangler dev.
// Usage: bun scripts/send-event.ts "zinc 120toig tgd" [--event-id id]
//   [--age-seconds n] [--conversation id] [--account id] [--bad-signature]
//   [--event type] [--direction incoming|outgoing] [--url http://...]
const DEV_VARS = new URL("../.dev.vars", import.meta.url).pathname;

const devVar = async (key: string): Promise<string> => {
	const text = await Bun.file(DEV_VARS)
		.text()
		.catch(() => "");
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (trimmed.startsWith(`${key}=`)) {
			return trimmed.slice(key.length + 1);
		}
	}
	return "";
};

const arg = (flag: string): string | undefined => {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (flag: string): boolean => process.argv.includes(flag);

const FLAGS_WITH_VALUE = new Set([
	"--account",
	"--age-seconds",
	"--conversation",
	"--direction",
	"--event",
	"--event-id",
	"--image",
	"--postback",
	"--quick-reply",
	"--url",
]);
const positional: Array<string> = [];
for (let i = 2; i < process.argv.length; i++) {
	const a = process.argv[i];
	if (a.startsWith("--")) {
		if (FLAGS_WITH_VALUE.has(a)) {
			i++;
		}
		continue;
	}
	positional.push(a);
}
const image = arg("--image");
const postback = arg("--postback");
const quickReply = arg("--quick-reply");
const isTap = postback !== undefined || quickReply !== undefined;
const text = positional[0] ?? (isTap ? "" : "sain bnu");

const secret = await devVar("ZERNIO_WEBHOOK_SECRET");
const account = arg("--account") ?? (await devVar("ZERNIO_ACCOUNT_IDS")).split(",")[0].trim();
const conversation = arg("--conversation") ?? "conv_local_1";
const eventId = arg("--event-id") ?? crypto.randomUUID();
const ageSeconds = Number(arg("--age-seconds") ?? "0");
const eventType = arg("--event") ?? "message.received";
const direction = arg("--direction") ?? "incoming";
const url = arg("--url") ?? "http://127.0.0.1:8787/zernio/webhook";

const timestamp = new Date(Date.now() - ageSeconds * 1000).toISOString();
const messageId = `zmid_${crypto.randomUUID().slice(0, 8)}`;
const envelope = {
	account: { id: account, platform: "facebook" },
	conversation: { id: conversation, platformConversationId: "psid_local" },
	event: eventType,
	id: eventId,
	message: {
		attachments: image === undefined ? [] : [{ type: "image", url: image }],
		conversationId: conversation,
		direction,
		id: messageId,
		platform: "facebook",
		platformMessageId: `pmid_${crypto.randomUUID().slice(0, 8)}`,
		sender: { id: "psid_local", name: "Local Dev" },
		sentAt: timestamp,
		text: direction === "incoming" ? text : `[outgoing] ${text}`,
	},
	metadata: postback
		? { postbackPayload: postback }
		: quickReply
			? { quickReplyPayload: quickReply }
			: null,
	timestamp,
};

const body = JSON.stringify(envelope);
const key = await crypto.subtle.importKey(
	"raw",
	new TextEncoder().encode(secret),
	{ hash: "SHA-256", name: "HMAC" },
	false,
	["sign"],
);
const signature = has("--bad-signature")
	? "00".repeat(32)
	: Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString(
			"hex",
		);

const response = await fetch(url, {
	body,
	headers: { "content-type": "application/json", "x-zernio-signature": signature },
	method: "POST",
});
console.log(
	`${response.status} event=${eventId} conversation=${conversation} text=${JSON.stringify(text)}`,
);
console.log(await response.text());
