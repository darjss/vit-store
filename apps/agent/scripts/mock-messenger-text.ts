process.env.MESSENGER_PAGE_ID ??= "TEST_PAGE_ID";
process.env.MESSENGER_PAGE_ACCESS_TOKEN ??= "TEST_PAGE_TOKEN";
process.env.MESSENGER_APP_SECRET ??= "TEST_APP_SECRET";
process.env.MESSENGER_VERIFY_TOKEN ??= "TEST_VERIFY_TOKEN";

const [{ channel }, { admitMessengerTextMessage }] = await Promise.all([
	import("../src/channels/messenger"),
	import("../src/channels/messenger-admission"),
]);

const pageId = process.env.MESSENGER_PAGE_ID;
const psid = process.env.MESSENGER_TEST_PSID ?? "TEST_CUSTOMER_PSID";
const text = process.argv.slice(2).join(" ") || "sain baina uu";
const messageId = "mock-mid-1";

const event = {
	sender: { id: psid },
	recipient: { id: pageId },
	timestamp: Date.now(),
	message: { mid: messageId, text },
};
const firstAdmission = await admitMessengerTextMessage({ channel, event });
const duplicateAdmission = await admitMessengerTextMessage({ channel, event });
if (firstAdmission === undefined)
	throw new Error("mock event was not admitted");
if (duplicateAdmission !== undefined)
	throw new Error("duplicate mock event was admitted");

console.log(
	JSON.stringify(
		{
			received: { pageId, psid, messageId, text },
			sessionId: firstAdmission.sessionId,
			duplicateAdmitted: false,
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
