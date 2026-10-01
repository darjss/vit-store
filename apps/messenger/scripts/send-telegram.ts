// Synthetic Telegram Update sender for local wrangler dev.
// Usage: bun scripts/send-telegram.ts "энэ долоо хоногт хэдэн захиалга ирсэн бэ"
//   [--update-id n] [--chat-id n] [--callback <data>] [--callback-message-id n]
//   [--bad-secret] [--url http://...]
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
	"--callback",
	"--callback-message-id",
	"--chat-id",
	"--update-id",
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
const text = positional[0] ?? "sain bnu";

const secret = await devVar("TELEGRAM_WEBHOOK_SECRET");
const chatId = Number(arg("--chat-id") ?? (await devVar("TELEGRAM_ADMIN_CHAT_ID")));
const updateId = Number(arg("--update-id") ?? Math.floor(Date.now() / 1000));
const callbackData = arg("--callback");
const callbackMessageId = Number(arg("--callback-message-id") ?? "42");

const message = {
	chat: { id: chatId, type: "private" },
	from: { id: chatId, username: "local_admin" },
	message_id:
		callbackData === undefined ? Math.floor(Math.random() * 1_000_000) : callbackMessageId,
	text,
};

const update =
	callbackData === undefined
		? { message, update_id: updateId }
		: {
				callback_query: {
					data: callbackData,
					from: { id: chatId, username: "local_admin" },
					id: `cbq_${updateId}`,
					message,
				},
				update_id: updateId,
			};

const url = arg("--url") ?? "http://127.0.0.1:8787/telegram/webhook";
const response = await fetch(url, {
	body: JSON.stringify(update),
	headers: {
		"content-type": "application/json",
		"x-telegram-bot-api-secret-token": has("--bad-secret") ? "wrong" : secret,
	},
	method: "POST",
});
console.log(`update ${updateId} -> ${response.status}`);
console.log(await response.text());
