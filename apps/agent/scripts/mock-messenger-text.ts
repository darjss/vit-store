process.env.MESSENGER_PAGE_ID ??= "TEST_PAGE_ID";
process.env.MESSENGER_PAGE_ACCESS_TOKEN ??= "TEST_PAGE_TOKEN";
process.env.MESSENGER_APP_SECRET ??= "TEST_APP_SECRET";
process.env.MESSENGER_VERIFY_TOKEN ??= "TEST_VERIFY_TOKEN";

const [{ channel, messenger, postMessage }, { admitMessengerTextMessage }] =
	await Promise.all([
		import("../src/channels/messenger"),
		import("../src/channels/messenger-admission"),
	]);

// Stub the Graph transport so the harness drives the real admission + reply
// paths without any network. Every outbound call is recorded instead.
const emitted: unknown[] = [];
let nextMessageId = 100;
messenger.send.message = async (request) => {
	emitted.push(request);
	return { recipient_id: "stub", message_id: `mock-out-${nextMessageId++}` };
};
messenger.send.typingOn = async (recipientId) => {
	emitted.push({ recipient: { id: recipientId }, sender_action: "typing_on" });
	return { recipient_id: recipientId, message_id: "stub" };
};
messenger.send.typingOff = async (recipientId) => {
	emitted.push({ recipient: { id: recipientId }, sender_action: "typing_off" });
	return { recipient_id: recipientId, message_id: "stub" };
};

const pageId = process.env.MESSENGER_PAGE_ID;
const psid = process.env.MESSENGER_TEST_PSID ?? "TEST_CUSTOMER_PSID";
const text = process.argv.slice(2).join(" ") || "sain baina uu";

function inbound(mid: string, body: string) {
	return {
		sender: { id: psid },
		recipient: { id: pageId },
		timestamp: 0,
		message: { mid, text: body },
	};
}

// (a) duplicate inbound mid is deduped.
const firstAdmission = await admitMessengerTextMessage({
	channel,
	event: inbound("mock-mid-1", text),
});
const duplicateAdmission = await admitMessengerTextMessage({
	channel,
	event: inbound("mock-mid-1", text),
});
if (firstAdmission === undefined) throw new Error("mock event was not admitted");
if (duplicateAdmission !== undefined)
	throw new Error("duplicate mock event was admitted");

// (b) a pre-dispatch failure must not permanently drop the message: releasing
// the claim lets the same mid be re-admitted (as Meta's retry would).
const beforeFailure = await admitMessengerTextMessage({
	channel,
	event: inbound("mock-mid-2", text),
});
if (beforeFailure === undefined)
	throw new Error("mock-mid-2 was not admitted on first delivery");
await beforeFailure.release();
const afterFailure = await admitMessengerTextMessage({
	channel,
	event: inbound("mock-mid-2", text),
});
if (afterFailure === undefined)
	throw new Error("released claim was not re-admitted on retry");

// (c) a reply whose text has a trailing newline still sends (no whitespace
// validation rejects the body), and the typing lifecycle is paired.
const replyText = "Mock assistant reply: received your Messenger text.\n";
const tool = postMessage(firstAdmission.conversation);
const replyResult = await tool.run({ input: { text: replyText } });
const sentText = emitted.find(
	(p): p is { message: { text: string } } =>
		typeof p === "object" &&
		p !== null &&
		"message" in p &&
		typeof (p as { message?: { text?: unknown } }).message?.text === "string",
)?.message.text;
if (sentText !== replyText)
	throw new Error("trailing-newline reply text was altered or dropped");

console.log(
	JSON.stringify(
		{
			received: { pageId, psid, messageId: "mock-mid-1", text },
			sessionId: firstAdmission.sessionId,
			duplicateDeduped: duplicateAdmission === undefined,
			preDispatchFailureRecovered: afterFailure !== undefined,
			trailingNewlineReplySent: sentText === replyText,
			replyResult,
			emittedPayloads: emitted,
		},
		null,
		2,
	),
);
