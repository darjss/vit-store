#!/usr/bin/env bun
/**
 * messenger-explore.ts — reusable explorer for the Facebook Messenger export.
 *
 * Data lives at <repo>/messenger-chat-history/messages/inbox/<conv>/message_*.json
 * (+ a photos/ subdir per conversation). Override the root with MESSENGER_DATA_DIR.
 * The store/Page side of each conversation is identified by sender_name equal to
 * MESSENGER_ADMIN_NAME (default "Amerik huns baraa"); the other participant is the
 * customer.
 *
 * Usage:
 *   bun scripts/messenger-explore.ts list [--sort msgs|photos|recent] [--limit N]
 *   bun scripts/messenger-explore.ts show <conv> [--desc]
 *   bun scripts/messenger-explore.ts search <query>... [--limit N] [--context]
 *   bun scripts/messenger-explore.ts flow <conv>
 *   bun scripts/messenger-explore.ts stats
 *   bun scripts/messenger-explore.ts photos <conv> [--copy <dir>]
 *
 * <conv> is the conversation folder name (unique enough prefix is accepted).
 *
 * This is a read-only analysis tool. Nothing is written except when you explicitly
 * use `photos --copy <dir>`.
 */
import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, basename, dirname } from "node:path";

const ADMIN_NAME = process.env.MESSENGER_ADMIN_NAME ?? "Amerik huns baraa";
const DATA_DIR =
	process.env.MESSENGER_DATA_DIR ??
	join(import.meta.dirname ?? ".", "..", "messenger-chat-history", "messages", "inbox");

// ---------- types ----------

interface Photo { uri: string; creation_timestamp?: number }
interface Reaction { reaction?: string; actor?: string }
interface Msg {
	sender_name?: string;
	timestamp_ms?: number;
	content?: string;
	photos?: Photo[];
	files?: { uri: string }[];
	audio_files?: { uri: string }[];
	videos?: { uri: string }[];
	gifs?: { uri: string }[];
	sticker?: { uri?: string };
	share?: { link?: string };
	reactions?: Reaction[];
	call_duration?: number;
	is_geoblocked_for_viewer?: boolean;
}
interface Conversation {
	participants: { name: string }[];
	messages: Msg[];
	title?: string;
	thread_path?: string;
	is_still_participant?: boolean;
}
interface LoadedConv {
	folder: string;
	path: string;
	data: Conversation;
}

// ---------- loading ----------

function loadConv(folder: string): LoadedConv | null {
	const dir = join(DATA_DIR, folder);
	if (!existsSync(dir)) return null;
	// Some exports split a thread into message_1.json, message_2.json, ...
	const files = readdirSync(dir)
		.filter((f) => /^message_\d+\.json$/.test(f))
		.sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
	if (files.length === 0) return null;
	const merged: Conversation = { participants: [], messages: [] };
	for (const f of files) {
		const raw = JSON.parse(readFileSync(join(dir, f), "utf8")) as Conversation;
		if (merged.participants.length === 0) merged.participants = raw.participants;
		merged.messages.push(...raw.messages);
		merged.title ??= raw.title;
		merged.thread_path ??= raw.thread_path;
		merged.is_still_participant ??= raw.is_still_participant;
	}
	// oldest first
	merged.messages.sort((a, b) => (a.timestamp_ms ?? 0) - (b.timestamp_ms ?? 0));
	return { folder, path: dir, data: merged };
}

function loadAll(): LoadedConv[] {
	if (!existsSync(DATA_DIR)) {
		console.error(`Data dir not found: ${DATA_DIR}`);
		process.exit(1);
	}
	const out: LoadedConv[] = [];
	for (const folder of readdirSync(DATA_DIR)) {
		const st = statSync(join(DATA_DIR, folder));
		if (!st.isDirectory()) continue;
		const c = loadConv(folder);
		if (c && c.data.messages.length > 0) out.push(c);
	}
	return out;
}

function resolveConv(query: string): LoadedConv | null {
	// exact folder
	const direct = loadConv(query);
	if (direct) return direct;
	// unique prefix
	const all = loadAll();
	const matches = all.filter((c) => c.folder.startsWith(query));
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) {
		console.error(`Ambiguous conversation prefix "${query}":`);
		for (const m of matches.slice(0, 10)) console.error(`  ${m.folder}`);
		process.exit(2);
	}
	// match by participant/title
	const lower = query.toLowerCase();
	const byName = all.filter(
		(c) =>
			c.data.title?.toLowerCase().includes(lower) ||
			c.data.participants.some((p) => p.name.toLowerCase().includes(lower)),
	);
	if (byName.length === 1) return byName[0];
	if (byName.length > 1) {
		console.error(`Multiple conversations match "${query}":`);
		for (const m of byName.slice(0, 10)) console.error(`  ${m.folder}  (msgs=${m.data.messages.length})`);
		process.exit(2);
	}
	return null;
}

// ---------- helpers ----------

function roleOf(m: Msg): "ADMIN" | "USER" | "?" {
	if (m.sender_name === ADMIN_NAME) return "ADMIN";
	if (m.sender_name) return "USER";
	return "?";
}

function fmtDate(ms?: number): string {
	if (!ms) return "?";
	const d = new Date(ms);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function customerName(c: Conversation): string {
	return c.participants.find((p) => p.name !== ADMIN_NAME)?.name ?? "customer";
}

function photoFile(p: Photo): string {
	return basename(p.uri) ?? p.uri;
}

function summarizeMsg(m: Msg): string {
	const parts: string[] = [];
	if (m.content) parts.push(`txt: ${m.content.replace(/\n/g, " ⏎ ")}`);
	if (m.photos?.length) parts.push(`📷 photo×${m.photos.length} (${m.photos.map(photoFile).join(", ")})`);
	if (m.files?.length) parts.push(`📄 file×${m.files.length}`);
	if (m.audio_files?.length) parts.push(`🎙 audio×${m.audio_files.length}`);
	if (m.videos?.length) parts.push(`🎬 video×${m.videos.length}`);
	if (m.gifs?.length) parts.push(`🎞 gif×${m.gifs.length}`);
	if (m.sticker) parts.push(`🏷 sticker`);
	if (m.share?.link) parts.push(`🔗 ${m.share.link}`);
	if (m.call_duration != null) parts.push(`📞 call ${m.call_duration}s`);
	if (m.reactions?.length) parts.push(`❤ ${m.reactions.map((r) => r.reaction).join("")}`);
	if (parts.length === 0) parts.push("(no content)");
	return parts.join(" | ");
}

// ---------- commands ----------

function cmdList(args: string[]) {
	let sort: "msgs" | "photos" | "recent" = "msgs";
	let limit = 30;
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--sort" && args[i + 1]) sort = args[++i] as typeof sort;
		else if (args[i] === "--limit" && args[i + 1]) limit = Number(args[++i]);
	}
	const all = loadAll();
	const rows = all.map((c) => {
		const msgs = c.data.messages;
		const photos = msgs.reduce((n, m) => n + (m.photos?.length ?? 0), 0);
		const userPhotos = msgs.reduce(
			(n, m) => n + (roleOf(m) === "USER" ? m.photos?.length ?? 0 : 0),
			0,
		);
		const last = msgs[msgs.length - 1]?.timestamp_ms ?? 0;
		const first = msgs[0]?.timestamp_ms ?? 0;
		return { folder: c.folder, msgs: msgs.length, photos, userPhotos, first, last };
	});
	rows.sort((a, b) => {
		if (sort === "msgs") return b.msgs - a.msgs;
		if (sort === "photos") return b.photos - a.photos;
		return b.last - a.last;
	});
	const top = rows.slice(0, limit);
	console.log(`# ${all.length} conversations  (admin = "${ADMIN_NAME}")  sorted by ${sort}\n`);
	console.log(
		"folder".padEnd(48) +
			"msgs".padStart(7) +
			"photos".padStart(8) +
			"user📸".padStart(8) +
			"first".padStart(12) +
			"last".padStart(12),
	);
	for (const r of top) {
		console.log(
			r.folder.slice(0, 47).padEnd(48) +
				String(r.msgs).padStart(7) +
				String(r.photos).padStart(8) +
				String(r.userPhotos).padStart(8) +
				fmtDate(r.first).slice(0, 10).padStart(12) +
				fmtDate(r.last).slice(0, 10).padStart(12),
		);
	}
}

function cmdShow(args: string[]) {
	const desc = args.includes("--desc");
	const convArg = args.find((a) => !a.startsWith("--"));
	if (!convArg) { console.error("show <conv>"); process.exit(2); }
	const c = resolveConv(convArg);
	if (!c) { console.error(`Conversation not found: ${convArg}`); process.exit(2); }
	const msgs = [...c.data.messages];
	if (desc) msgs.reverse();
	console.log(`# ${c.folder}`);
	console.log(`# participants: ${c.data.participants.map((p) => p.name).join(" | ")}`);
	console.log(`# title: ${c.data.title ?? "(none)"}  ·  still_participant: ${c.data.is_still_participant}`);
	console.log(`# ${msgs.length} messages  (${fmtDate(c.data.messages[0]?.timestamp_ms)} → ${fmtDate(c.data.messages[c.data.messages.length - 1]?.timestamp_ms)})\n`);
	for (const m of msgs) {
		const role = roleOf(m);
		const tag = role === "ADMIN" ? "ADMIN" : role === "USER" ? "USER " : "?    ";
		console.log(`[${fmtDate(m.timestamp_ms)}] ${tag}  ${summarizeMsg(m)}`);
	}
}

function cmdSearch(args: string[]) {
	let limit = 20;
	const flags = new Set<string>();
	const terms: string[] = [];
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--limit" && args[i + 1]) limit = Number(args[++i]);
		else if (args[i] === "--context") flags.add("context");
		else if (!args[i].startsWith("--")) terms.push(args[i]);
	}
	if (terms.length === 0) { console.error("search <query>..."); process.exit(2); }
	const needle = terms.join(" ").toLowerCase();
	const all = loadAll();
	let shown = 0;
	for (const c of all) {
		if (shown >= limit) break;
		const hits: { idx: number; m: Msg }[] = [];
		c.data.messages.forEach((m, idx) => {
			if (m.content?.toLowerCase().includes(needle)) hits.push({ idx, m });
		});
		if (hits.length === 0) continue;
		console.log(`\n=== ${c.folder}  (${hits.length} hit${hits.length === 1 ? "" : "s"}) ===`);
		for (const h of hits.slice(0, flags.has("context") ? 3 : 1)) {
			if (flags.has("context")) {
				const start = Math.max(0, h.idx - 1);
				const end = Math.min(c.data.messages.length, h.idx + 2);
				for (let i = start; i < end; i++) {
					const mm = c.data.messages[i];
					const mark = i === h.idx ? "▶" : " ";
					console.log(`${mark} [${fmtDate(mm.timestamp_ms)}] ${roleOf(mm).padEnd(5)} ${summarizeMsg(mm)}`);
				}
				console.log("─".repeat(60));
			} else {
				console.log(`▶ [${fmtDate(h.m.timestamp_ms)}] ${roleOf(h.m).padEnd(5)} ${summarizeMsg(h.m)}`);
			}
		}
		shown++;
	}
	console.log(`\n(${shown} conversation${shown === 1 ? "" : "s"} shown, limit ${limit})`);
}

// Heuristic ordering-flow phase detector. Tuned to the romanized Mongolian
// patterns observed in the export (Sn bnuu, Bgaa, Utas, hayag/hayg, Za, etc.).
const PHASE_PATTERNS: { phase: string; role: "ADMIN" | "USER" | "ANY"; re: RegExp }[] = [
	{ phase: "greeting", role: "ADMIN", re: /^(hi|сайн|sn bnuu|sain bnuu|za+[, ]|thanks for contacting)/i },
	{ phase: "inquiry/photo", role: "USER", re: /^📷/ }, // handled specially below too
	{ phase: "inquiry/text", role: "USER", re: /\?|bn uu|bnuu|bga yu|bga uu|une/i },
	{ phase: "price_quote", role: "ADMIN", re: /(bgaa\s*\d|\d{3,}\s*mn?t?|une|үнэ)/i },
	{ phase: "phone_request", role: "ADMIN", re: /^(utas|утас|telefon)/i },
	{ phase: "phone_given", role: "USER", re: /^\d{8,}$/ },
	{ phase: "address_request", role: "ADMIN", re: /(hayg|hayag|хаана|haana|хаяг)/i },
	{ phase: "confirm", role: "ADMIN", re: /^(za+|ok|за+|тийм|tiim|баярлалаа|bayrlalaa)/i },
];

function cmdFlow(args: string[]) {
	const convArg = args.find((a) => !a.startsWith("--"));
	if (!convArg) { console.error("flow <conv>"); process.exit(2); }
	const c = resolveConv(convArg);
	if (!c) { console.error(`Conversation not found: ${convArg}`); process.exit(2); }
	const msgs = c.data.messages;
	const timeline: string[] = [];
	let lastPhase = "";
	for (const m of msgs) {
		const role = roleOf(m);
		let phase = "";
		if (m.photos?.length && role === "USER") phase = "inquiry/photo";
		for (const p of PHASE_PATTERNS) {
			if (phase) break;
			if (p.role !== "ANY" && p.role !== role) continue;
			const text = m.content ?? (phase === "inquiry/photo" ? "📷" : "");
			if (p.re.test(text)) phase = p.phase;
		}
		if (phase && phase !== lastPhase) {
			timeline.push(`[${fmtDate(m.timestamp_ms)}] ${phase.padEnd(16)} ← ${role} ${summarizeMsg(m).slice(0, 70)}`);
			lastPhase = phase;
		}
	}
	console.log(`# flow: ${c.folder}`);
	console.log(`# ${msgs.length} messages, ${timeline.length} phase transitions\n`);
	if (timeline.length === 0) {
		console.log("(no ordering-flow phases detected — may be a non-order conversation)");
	} else {
		for (const t of timeline) console.log(t);
	}
	console.log(`\n# full conversation: bun scripts/messenger-explore.ts show ${c.folder}`);
}

function cmdStats() {
	const all = loadAll();
	let totalMsgs = 0;
	let totalPhotos = 0;
	let userPhotos = 0;
	let adminPhotos = 0;
	let convsWithPhotos = 0;
	let userInitiated = 0;
	let adminInitiated = 0;
	const adminPhraseFreq = new Map<string, number>();
	let convsWithOrderSignals = 0;

	const ORDER_SIGNAL = /(utas|hayg|hayag|bgaa\s*\d)/i;

	for (const c of all) {
		const msgs = c.data.messages;
		if (msgs.length === 0) continue;
		totalMsgs += msgs.length;
		let hasPhoto = false;
		let hasOrderSignal = false;
		for (const m of msgs) {
			const role = roleOf(m);
			const pc = m.photos?.length ?? 0;
			if (pc > 0) {
				totalPhotos += pc;
				hasPhoto = true;
				if (role === "USER") userPhotos += pc;
				else if (role === "ADMIN") adminPhotos += pc;
			}
			if (m.content && ORDER_SIGNAL.test(m.content)) hasOrderSignal = true;
			if (role === "ADMIN" && m.content) {
				const key = m.content.toLowerCase().slice(0, 40);
				adminPhraseFreq.set(key, (adminPhraseFreq.get(key) ?? 0) + 1);
			}
		}
		if (hasPhoto) convsWithPhotos++;
		if (hasOrderSignal) convsWithOrderSignals++;
		const first = roleOf(msgs[0]);
		if (first === "USER") userInitiated++;
		else if (first === "ADMIN") adminInitiated++;
	}

	console.log(`# Messenger export stats`);
	console.log(`# admin = "${ADMIN_NAME}", data = ${DATA_DIR}\n`);
	console.log(`conversations:        ${all.length}`);
	console.log(`total messages:        ${totalMsgs}`);
	console.log(`avg msgs / conv:       ${(totalMsgs / all.length).toFixed(1)}`);
	console.log(`convs with photos:     ${convsPhotosPct(all.length, convsWithPhotos)}`);
	console.log(`total photos:          ${totalPhotos}  (user ${userPhotos}, admin ${adminPhotos})`);
	console.log(`convs with order sig:  ${convsPhotosPct(all.length, convsWithOrderSignals)}  (mentions utas/hayg/price)`);
	console.log(`first message from:    USER ${userInitiated} / ADMIN ${adminInitiated}`);
	console.log(`\n# top admin opening phrases (canned greetings etc.):`);
	const top = [...adminPhraseFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
	for (const [phrase, n] of top) console.log(`  ${String(n).padStart(5)}  ${phrase}`);
}

function convsPhotosPct(total: number, n: number): string {
	const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0";
	return `${n} (${pct}%)`;
}

function cmdPhotos(args: string[]) {
	let copyTo: string | null = null;
	const convArg = args.find((a) => !a.startsWith("--"));
	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--copy" && args[i + 1]) copyTo = args[++i];
	}
	if (!convArg) { console.error("photos <conv> [--copy <dir>]"); process.exit(2); }
	const c = resolveConv(convArg);
	if (!c) { console.error(`Conversation not found: ${convArg}`); process.exit(2); }
	const photos: { m: Msg; p: Photo }[] = [];
	for (const m of c.data.messages) for (const p of m.photos ?? []) photos.push({ m, p });
	console.log(`# ${c.folder} — ${photos.length} photos`);
	if (copyTo) {
		mkdirSync(copyTo, { recursive: true });
	}
	for (const { m, p } of photos) {
		const role = roleOf(m);
		// the uri is relative to the export root (messenger-chat-history/), so
		// resolve it against the parent of messages/
		const exportRoot = dirname(dirname(DATA_DIR)); // .../messenger-chat-history
		const abs = join(exportRoot, p.uri.replace(/^.*messages\//, "messages/"));
		console.log(`[${fmtDate(m.timestamp_ms)}] ${role}  ${photoFile(p)}  ${existsSync(abs) ? "✓" : "✗missing"}`);
		if (copyTo && existsSync(abs)) {
			const dest = join(copyTo, `${role}_${m.timestamp_ms}_${photoFile(p)}`);
			copyFileSync(abs, dest);
		}
	}
	if (copyTo) console.log(`\n(copied available photos to ${copyTo})`);
}

// ---------- dispatch ----------

function main() {
	const [cmd, ...rest] = process.argv.slice(2) as string[];
	if (!cmd || cmd === "help" || cmd === "--help") {
		console.log(`messenger-explore.ts
  list   [--sort msgs|photos|recent] [--limit N]   rank conversations
  show   <conv> [--desc]                            render one conversation
  search <query>... [--limit N] [--context]         full-text search
  flow   <conv>                                    detect ordering-flow phases
  stats                                            aggregate export stats
  photos <conv> [--copy <dir>]                      list (or copy) photos

Env: MESSENGER_DATA_DIR (default ../messenger-chat-history/messages/inbox)
     MESSENGER_ADMIN_NAME (default "Amerik huns baraa")`);
		return;
	}
	switch (cmd) {
		case "list": return cmdList(rest);
		case "show": return cmdShow(rest);
		case "search": return cmdSearch(rest);
		case "flow": return cmdFlow(rest);
		case "stats": return cmdStats();
		case "photos": return cmdPhotos(rest);
		default:
			console.error(`Unknown command: ${cmd}`);
			process.exit(2);
	}
}

main();
