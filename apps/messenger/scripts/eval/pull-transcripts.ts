// Pulls admin transcripts (inbox payloads, full ModelMessages with tool
// calls/results, turn outcomes, outbox, payments) from the worker's /admin
// routes into EVAL_DIR/transcripts/<YYYY-MM-DD of --since in UB>/, one JSON
// file per thread plus one per --telegram chat id.
// Usage: bun --env-file=<file with ADMIN_TOKEN> scripts/eval/pull-transcripts.ts \
//   [--since 2026-10-01] [--telegram <chatId>] [--url http://localhost:8787]
// Default --since is yesterday 00:00 Ulaanbaatar time; MESSENGER_URL sets the
// default --url (https://messenger.amerikvitamin.mn).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as v from "valibot";
import { EVAL_DIR } from "./paths";

const arg = (flag: string): string | undefined => {
	const i = process.argv.indexOf(flag);
	return i >= 0 ? process.argv[i + 1] : undefined;
};

const args = (flag: string): Array<string> => {
	const values: Array<string> = [];
	for (const [i, a] of process.argv.entries()) {
		const value = process.argv[i + 1];
		if (a === flag && value !== undefined) {
			values.push(value);
		}
	}
	return values;
};

const token = process.env.ADMIN_TOKEN;
if (!token) {
	console.error("Set ADMIN_TOKEN (the worker's admin bearer secret).");
	process.exit(1);
}

const base = (
	arg("--url") ??
	process.env.MESSENGER_URL ??
	"https://messenger.amerikvitamin.mn"
).replace(/\/+$/, "");

const ubDate = (d: Date): string =>
	new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(d);

const ubMidnightYesterday = (): Date =>
	new Date(`${ubDate(new Date(Date.now() - 86_400_000))}T00:00:00+08:00`);
// A bare date means midnight in Ulaanbaatar, not UTC.
const sinceArg = arg("--since");
const since =
	sinceArg === undefined
		? ubMidnightYesterday()
		: new Date(/^\d{4}-\d{2}-\d{2}$/.test(sinceArg) ? `${sinceArg}T00:00:00+08:00` : sinceArg);
if (Number.isNaN(since.getTime())) {
	console.error(`Bad --since: ${sinceArg}`);
	process.exit(1);
}

const threadListSchema = v.array(v.object({ last_at: v.number(), thread_id: v.string() }));

const get = async (path: string) => {
	const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${token}` } });
	if (!res.ok) {
		throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
	}
	return res.json();
};

const outDir = join(EVAL_DIR, "transcripts", ubDate(since));
mkdirSync(outDir, { recursive: true });

const threads = v.parse(
	threadListSchema,
	await get(`/admin/conversations?since=${since.getTime()}`),
);
// adminList caps at 1000 newest threads; a full page means older ones were cut.
if (threads.length >= 1000) {
	console.error("Thread list hit the 1000 cap: older threads in this range are missing.");
}
let written = 0;
for (const t of threads) {
	const transcript = await get(
		`/admin/conversations/${encodeURIComponent(t.thread_id)}/transcript`,
	);
	writeFileSync(
		join(outDir, `${t.thread_id.replaceAll(":", "_")}.json`),
		JSON.stringify(transcript, null, 1),
	);
	written += 1;
	console.error(`${t.thread_id} (${written}/${threads.length})`);
}
for (const chatId of args("--telegram")) {
	const transcript = await get(`/admin/telegram/${encodeURIComponent(chatId)}/transcript`);
	writeFileSync(join(outDir, `telegram_${chatId}.json`), JSON.stringify(transcript, null, 1));
	written += 1;
}

console.log(JSON.stringify({ out: outDir, since: since.toISOString(), written }));
