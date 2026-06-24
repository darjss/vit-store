process.env.MESSENGER_PAGE_ID ??= "TEST_PAGE_ID";
process.env.MESSENGER_PAGE_ACCESS_TOKEN ??= "TEST_PAGE_TOKEN";
process.env.MESSENGER_APP_SECRET ??= "TEST_APP_SECRET";
process.env.MESSENGER_VERIFY_TOKEN ??= "TEST_VERIFY_TOKEN";

const { channel } = await import("../src/channels/messenger");

const pageId = process.env.MESSENGER_PAGE_ID;
const psid = process.env.MESSENGER_TEST_PSID ?? "TEST_CUSTOMER_PSID";
const text = process.argv.slice(2).join(" ") || "sain baina uu";

const event = {
	sender: { id: psid },
	recipient: { id: pageId },
	timestamp: Date.now(),
	message: { mid: `mock-${Date.now()}`, text },
};
const conversation = channel.conversationRef(event);
if (conversation === undefined)
	throw new Error("mock event did not map to a conversation");

console.log(
	JSON.stringify(
		{
			received: { pageId, psid, text },
			sessionId: channel.conversationKey(conversation),
			emittedPayloads: [
				{ recipient: { id: psid }, sender_action: "typing_on" },
				{
					recipient: { id: psid },
					messaging_type: "RESPONSE",
					message: {
						text: "Mock assistant reply: received your Messenger text.",
					},
				},
				{ recipient: { id: psid }, sender_action: "typing_off" },
			],
		},
		null,
		2,
	),
);
