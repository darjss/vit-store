import { Messenger } from "@warriorteam/messenger-sdk";

export const messenger = new Messenger({
	accessToken: process.env.MESSENGER_ACCESS_TOKEN,
	version: "v23.0",
});

// // Send a text message
// const result = await messenger.send.message({
//   messaging_type: "MESSAGE_TAG",
//   recipient: { id: 'USER_PSID' },
//   message: { text: 'Hello from Vit Store Messenger SDK!' }
// });

// console.log('Message sent:', result.message_id);
