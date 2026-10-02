// Dumps recent Messenger conversations from the Zernio inbox API (no webhook)
// into EVAL_DIR/zernio/<accountId>/, one JSON file per conversation, with
// customer photos downloaded next to them (Facebook CDN URLs expire).
// Usage: bun --env-file=../../.env.prod scripts/eval/pull-zernio.ts \
//   [--account <zernioAccountId>] [--since 2026-10-01T00:00:00+08:00]
// Default --since is yesterday 00:00 Ulaanbaatar time.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as v from "valibot";
import { EVAL_DIR } from "./paths";

const arg = (flag: string): string | undefined => {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : undefined;
};

const BASE = "https://zernio.com/api/v1";
const REAL_PAGE = "6abf80aecb476a6db0a17892";
const account = arg("--account") ?? REAL_PAGE;
const apiKey = process.env.ZERNIO_API_KEY;
if (!apiKey) {
	console.error("Set ZERNIO_API_KEY (bun --env-file=<repo>/.env.prod ...).");
	process.exit(1);
}

const ubMidnightYesterday = (): Date => {
	const ubDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(
		new Date(Date.now() - 86_400_000),
	);
	return new Date(`${ubDate}T00:00:00+08:00`);
};
const since = arg("--since") === undefined ? ubMidnightYesterday() : new Date(arg("--since") ?? "");

const conversationListSchema = v.looseObject({
	data: v.array(
		v.looseObject({
			id: v.string(),
			participantName: v.optional(v.string()),
			updatedTime: v.string(),
		}),
	),
	pagination: v.looseObject({ hasMore: v.boolean(), nextCursor: v.nullish(v.string()) }),
});

const messageListSchema = v.looseObject({
	messages: v.array(
		v.looseObject({
			attachments: v.optional(
				v.array(v.looseObject({ type: v.optional(v.string()), url: v.optional(v.string()) })),
			),
			createdAt: v.string(),
			direction: v.picklist(["incoming", "outgoing"]),
			id: v.string(),
			message: v.optional(v.string()),
		}),
	),
	pagination: v.optional(
		v.looseObject({ hasMore: v.boolean(), nextCursor: v.nullish(v.string()) }),
	),
});

const get = async <S extends v.GenericSchema>(path: string, schema: S) => {
	const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${apiKey}` } });
	if (!res.ok) {
		throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
	}
	return v.parse(schema, await res.json());
};

export type DumpedMessage = {
	at: string;
	direction: "incoming" | "outgoing";
	id: string;
	photos: Array<string>;
	text: string;
};

const outDir = join(EVAL_DIR, "zernio", account);
const photoDir = join(outDir, "photos");
mkdirSync(photoDir, { recursive: true });

const conversations: Array<v.InferOutput<typeof conversationListSchema>["data"][number]> = [];
for (let cursor: string | null = null, done = false; !done;) {
	const page = await get(
		`/inbox/conversations?accountId=${account}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
		conversationListSchema,
	);
	for (const c of page.data) {
		if (Date.parse(c.updatedTime) < since.getTime()) {
			done = true;
			break;
		}
		conversations.push(c);
	}
	cursor = page.pagination.nextCursor ?? null;
	done ||= !page.pagination.hasMore || cursor === null;
	console.error(`listed ${conversations.length} (last ${page.data.at(-1)?.updatedTime ?? "-"})`);
}

const download = async (url: string, file: string): Promise<boolean> => {
	const res = await fetch(url);
	if (!res.ok) {
		return false;
	}
	await Bun.write(file, res);
	return true;
};

let messageCount = 0;
let photoCount = 0;
for (const c of conversations) {
	const raw: v.InferOutput<typeof messageListSchema>["messages"] = [];
	for (let cursor: string | null = null, more = true; more;) {
		const page = await get(
			`/inbox/conversations/${c.id}/messages?accountId=${account}&sortOrder=asc&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
			messageListSchema,
		);
		raw.push(...page.messages);
		cursor = page.pagination?.nextCursor ?? null;
		more = (page.pagination?.hasMore ?? false) && cursor !== null;
	}
	const messages: Array<DumpedMessage> = [];
	for (const m of raw.toSorted((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
		const photos: Array<string> = [];
		if (m.direction === "incoming") {
			for (const [i, a] of (m.attachments ?? []).entries()) {
				const file = join(photoDir, `${m.id.slice(-24)}_${i}.jpg`);
				if (a.type === "image" && a.url && (await download(a.url, file))) {
					photos.push(file);
				}
			}
		}
		photoCount += photos.length;
		messages.push({
			at: m.createdAt,
			direction: m.direction,
			id: m.id,
			photos,
			text: (m.message ?? "").trim(),
		});
	}
	messageCount += messages.length;
	console.error(`${c.id}: ${messages.length} messages, ${photoCount} photos so far`);
	writeFileSync(
		join(outDir, `${c.id}.json`),
		JSON.stringify({ id: c.id, messages, updatedTime: c.updatedTime }, null, 1),
	);
}

console.log(
	JSON.stringify({
		account,
		conversations: conversations.length,
		messages: messageCount,
		out: outDir,
		photos: photoCount,
		since: since.toISOString(),
	}),
);
