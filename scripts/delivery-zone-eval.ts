#!/usr/bin/env bun
/**
 * Delivery-zone resolver evaluation CLI.
 *
 * Env:
 *   DATABASE_URL or HYPERDRIVE_URL - Postgres connection string for historical orders.
 *   GOOGLE_MAPS_API_KEY or GOOGLE_MAP_API - optional Google Geocoding API key.
 *
 * Examples:
 *   bun scripts/delivery-zone-eval.ts eval --limit 20 --split 0.2 --cache-only
 *   bun scripts/delivery-zone-eval.ts eval --holdout-ids 101,102 --cache tmp/delivery-zone-geocodes.json
 *   bun scripts/delivery-zone-eval.ts aliases --out tmp/delivery-zone-aliases.json
 *
 * Geocode cache privacy: cache keys contain full customer delivery addresses,
 * and successful entries include precise lat/lng/place IDs. Keep cache files in
 * ignored local scratch space (the default tmp/ path is gitignored); do not
 * commit or share them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { SQL } from "bun";

interface OrderRow {
	id: number;
	orderNumber: string;
	address: string;
	addressZoneId: number;
	createdAt: string;
}

interface GeocodeEntry {
	status: "ok" | "missing" | "error";
	formattedAddress?: string;
	lat?: number;
	lng?: number;
	placeId?: string;
	error?: string;
}

type Cache = Record<string, GeocodeEntry>;

interface Candidate {
	zoneId: number;
	score: number;
	evidence: string[];
}

interface Options {
	cmd: "eval" | "aliases" | "help";
	limit: number;
	cachePath: string;
	cacheOnly: boolean;
	holdoutIds: Set<number>;
	split: number;
	out?: string;
	failures: number;
}

const DEFAULT_CACHE = "tmp/delivery-zone-geocodes.json";
const STOP = new Set(["байр", "toot", "тоот", "орц", "давхар", "floor", "утас", "utas", "хотхон", "hothon"]);

function parseArgs(argv: string[]): Options {
	const rawCmd = !argv[0] || argv[0] === "--help" || argv[0] === "-h" ? "help" : argv[0];
	if (!["eval", "aliases", "help"].includes(rawCmd)) {
		usage();
		console.error(`\nUnknown command: ${rawCmd}`);
		process.exit(2);
	}
	const cmd = rawCmd as Options["cmd"];
	const opts: Options = { cmd, limit: 100, cachePath: DEFAULT_CACHE, cacheOnly: false, holdoutIds: new Set(), split: 0, failures: 8 };
	for (let i = 1; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--limit") opts.limit = Number(argv[++i]);
		else if (a === "--cache") opts.cachePath = argv[++i];
		else if (a === "--cache-only") opts.cacheOnly = true;
		else if (a === "--holdout-ids") opts.holdoutIds = new Set(argv[++i].split(",").map((x) => Number(x.trim())).filter(Boolean));
		else if (a === "--split") opts.split = Number(argv[++i]);
		else if (a === "--out") opts.out = argv[++i];
		else if (a === "--failures") opts.failures = Number(argv[++i]);
		else if (a === "--help" || a === "-h") opts.cmd = "help";
		else throw new Error(`Unknown option: ${a}`);
	}
	return opts;
}

function usage() {
	console.log(`Delivery-zone resolver eval

Commands:
  eval      Score historical order holdouts and report top-1/top-3 accuracy
  aliases   Generate static zone alias/knowledge JSON for manual review

Options:
  --limit N              Max historical orders to load (default 100)
  --cache PATH           Geocode cache JSON path (default ${DEFAULT_CACHE}; contains customer address PII, do not commit/share)
  --cache-only           Do not call Google; use cached geocodes only
  --holdout-ids IDS      Comma-separated exact order ids to score and exclude from candidates
  --split FRACTION       Deterministic holdout fraction when --holdout-ids is omitted (e.g. 0.2)
  --out PATH             Write aliases JSON (aliases command) or eval JSON summary (eval)
  --failures N           Number of failure examples to print (default 8)

Env: DATABASE_URL/HYPERDRIVE_URL required. GOOGLE_MAPS_API_KEY/GOOGLE_MAP_API optional unless geocoding uncached addresses.`);
}

function normalize(s: string) {
	return s.toLowerCase().replace(/[.,;:()\[\]"'`]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(s: string) {
	return normalize(s).split(" ").filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !STOP.has(t));
}

function cacheKey(address: string) { return normalize(address); }

function loadCache(path: string): Cache {
	return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as Cache : {};
}

function saveCache(path: string, cache: Cache) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`);
}

async function geocode(address: string, cache: Cache, opts: Options): Promise<GeocodeEntry> {
	const key = cacheKey(address);
	if (cache[key]) return cache[key];
	if (opts.cacheOnly) return { status: "missing", error: "not in cache" };
	const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAP_API;
	if (!apiKey) return { status: "missing", error: "no GOOGLE_MAPS_API_KEY/GOOGLE_MAP_API" };
	const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
	url.searchParams.set("address", `${address}, Ulaanbaatar, Mongolia`);
	url.searchParams.set("key", apiKey);
	try {
		const res = await fetch(url);
		const body = await res.json() as any;
		const first = body.results?.[0];
		cache[key] = first ? { status: "ok", formattedAddress: first.formatted_address, lat: first.geometry.location.lat, lng: first.geometry.location.lng, placeId: first.place_id } : { status: "missing", error: body.status };
	} catch (error) {
		cache[key] = { status: "error", error: error instanceof Error ? error.message : String(error) };
	}
	return cache[key];
}

async function loadOrders(limit: number): Promise<OrderRow[]> {
	const url = process.env.DATABASE_URL ?? process.env.HYPERDRIVE_URL;
	if (!url) throw new Error("DATABASE_URL or HYPERDRIVE_URL is required");
	const sql = new SQL(url, {
		max: 1,
		tls: !/^postgres(ql)?:\/\/[a-f0-9]{32}:/.test(url),
	});
	try {
		const rows = await sql`select id, order_number as "orderNumber", address, address_zone_id as "addressZoneId", created_at as "createdAt" from ecom_vit_order where deleted_at is null and address_zone_id is not null and address <> '' order by created_at desc limit ${limit}` as OrderRow[];
		return rows.map((r) => ({ ...r, addressZoneId: Number(r.addressZoneId) }));
	} finally {
		await sql.close();
	}
}

function chooseHoldout(rows: OrderRow[], opts: Options) {
	if (opts.holdoutIds.size) return rows.filter((r) => opts.holdoutIds.has(r.id));
	const fraction = opts.split > 0 ? opts.split : 0.2;
	const every = Math.max(2, Math.round(1 / fraction));
	return rows.filter((r) => r.id % every === 0);
}

function buildKnowledge(rows: OrderRow[]) {
	const zones = new Map<number, { count: number; tokenCounts: Map<string, number>; examples: OrderRow[] }>();
	for (const r of rows) {
		const z = zones.get(r.addressZoneId) ?? { count: 0, tokenCounts: new Map(), examples: [] };
		z.count++;
		if (z.examples.length < 5) z.examples.push(r);
		for (const t of new Set(tokens(r.address))) z.tokenCounts.set(t, (z.tokenCounts.get(t) ?? 0) + 1);
		zones.set(r.addressZoneId, z);
	}
	return [...zones.entries()].map(([zoneId, z]) => ({
		zoneId,
		orderCount: z.count,
		aliases: [...z.tokenCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([token, count]) => ({ token, count })),
		examples: z.examples.map((e) => ({ id: e.id, orderNumber: e.orderNumber, address: e.address })),
	})).sort((a, b) => b.orderCount - a.orderCount || a.zoneId - b.zoneId);
}

function distanceKm(a?: GeocodeEntry, b?: GeocodeEntry) {
	if (a?.status !== "ok" || b?.status !== "ok" || a.lat == null || b.lat == null) return undefined;
	const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng! - a.lng!) * rad;
	const lat1 = a.lat * rad, lat2 = b.lat * rad;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function rank(target: OrderRow, training: OrderRow[], geos: Cache, knowledge: ReturnType<typeof buildKnowledge>): Candidate[] {
	const targetTokens = new Set(tokens(target.address));
	const byZone = new Map<number, Candidate>();
	for (const k of knowledge) {
		let score = Math.log1p(k.orderCount) * 0.05;
		const evidence: string[] = [`zone has ${k.orderCount} training orders`];
		const overlaps = k.aliases.filter((a) => targetTokens.has(a.token)).slice(0, 5);
		if (overlaps.length) { score += overlaps.reduce((n, a) => n + Math.min(3, a.count), 0); evidence.push(`alias overlap: ${overlaps.map((a) => a.token).join(", ")}`); }
		byZone.set(k.zoneId, { zoneId: k.zoneId, score, evidence });
	}
	for (const ex of training) {
		const c = byZone.get(ex.addressZoneId)!;
		const overlap = tokens(ex.address).filter((t) => targetTokens.has(t));
		if (overlap.length) { c.score += overlap.length * 2; c.evidence.push(`similar order ${ex.id}: ${overlap.slice(0, 4).join(", ")}`); }
		const km = distanceKm(geos[cacheKey(target.address)], geos[cacheKey(ex.address)]);
		if (km != null && km <= 5) { c.score += Math.max(0, 5 - km); c.evidence.push(`geocode near order ${ex.id}: ${km.toFixed(2)}km`); }
	}
	return [...byZone.values()].sort((a, b) => b.score - a.score || a.zoneId - b.zoneId).slice(0, 10);
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (opts.cmd === "help") return usage();
	const orders = await loadOrders(opts.limit);
	const holdout = opts.cmd === "eval" ? chooseHoldout(orders, opts) : [];
	const holdoutIds = new Set(holdout.map((r) => r.id));
	if (opts.cmd === "eval" && opts.holdoutIds.size) {
		const missing = [...opts.holdoutIds].filter((id) => !holdoutIds.has(id));
		if (missing.length) {
			console.error(`Requested holdout order IDs were not loaded/held out: ${missing.join(", ")}`);
			console.error("Increase --limit or verify the IDs have non-deleted orders with address_zone_id and address.");
			process.exit(2);
		}
	}
	const training = orders.filter((r) => !holdoutIds.has(r.id));
	const cache = loadCache(opts.cachePath);
	for (const r of orders) await geocode(r.address, cache, opts);
	saveCache(opts.cachePath, cache);
	const knowledge = buildKnowledge(training);
	if (opts.cmd === "aliases") {
		const payload = { generatedAt: new Date().toISOString(), sourceOrderCount: training.length, zones: knowledge };
		if (opts.out) { mkdirSync(dirname(opts.out), { recursive: true }); writeFileSync(opts.out, `${JSON.stringify(payload, null, 2)}\n`); }
		console.log(JSON.stringify(payload, null, 2));
		return;
	}
	let top1 = 0, top3 = 0;
	const failures: any[] = [];
	for (const h of holdout) {
		const ranked = rank(h, training, cache, knowledge);
		if (ranked[0]?.zoneId === h.addressZoneId) top1++;
		if (ranked.slice(0, 3).some((c) => c.zoneId === h.addressZoneId)) top3++;
		if (ranked[0]?.zoneId !== h.addressZoneId) failures.push({ orderId: h.id, address: h.address, actualZoneId: h.addressZoneId, topCandidates: ranked.slice(0, 3) });
	}
	const result = { loadedOrders: orders.length, trainingOrders: training.length, holdoutOrders: holdout.length, heldOutOrderIds: [...holdoutIds].sort((a, b) => a - b), cachePath: opts.cachePath, geocoded: Object.values(cache).filter((g) => g.status === "ok").length, top1Accuracy: holdout.length ? top1 / holdout.length : 0, top3Accuracy: holdout.length ? top3 / holdout.length : 0 };
	console.log(`# delivery-zone eval\n${JSON.stringify(result, null, 2)}\n`);
	console.log(`# failure examples`);
	for (const f of failures.slice(0, opts.failures)) console.log(JSON.stringify(f, null, 2));
	if (opts.out) { mkdirSync(dirname(opts.out), { recursive: true }); writeFileSync(opts.out, `${JSON.stringify({ ...result, failures }, null, 2)}\n`); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
