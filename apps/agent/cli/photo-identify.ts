/**
 * Photo-identification proof CLI (#20).
 *
 * Runs a sample photo through the REAL inbound-image pipeline on the running
 * agent worker and prints every artifact the issue asks to see:
 *
 *   local/exported photo
 *     ─▶ served over HTTP (stands in for the Meta CDN attachment url)
 *     ─▶ POST /messenger/photo-probe on the worker
 *        ─▶ fetch image ─▶ R2 put under messenger-inbound/  (prints the KEY)
 *        ─▶ identify_product_photo tool: Kimi vision via env.AI  (prints FACTS + QUERIES)
 *        ─▶ #19 search_products + card formatter              (prints CARD payloads)
 *     ─▶ JSON result back to this CLI
 *
 * The worker must be running with the REAL Workers AI binding (env.AI is
 * unsupported under local miniflare), e.g. via `bun run photo:proof` which boots
 * the worker with experimental_remote AI and then runs this CLI.
 *
 * This CLI also serves a small catalog fixture so the search→cards step has
 * products to format without standing up the full store API; the worker's
 * STORE_API_URL is pointed here by scripts/with-worker.ts. The vision call is
 * NOT stubbed — it is the real Kimi model.
 *
 *   bun cli/photo-identify.ts [imagePath]   (default: repo-root (1).jpg)
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SuperJSON } from "superjson";

const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(AGENT_ROOT, "..", "..");
const FIXTURE_PORT = 8799; // must match STORE_API_URL in scripts/with-worker.ts
const WORKER_URL = (
	process.env.MESSENGER_DEV_WORKER_URL ?? "http://127.0.0.1:3583"
).replace(/\/$/, "");

const C = {
	dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
	bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
	green: (s: string) => `\x1b[32m${s}\x1b[0m`,
	red: (s: string) => `\x1b[31m${s}\x1b[0m`,
	cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	gif: "image/gif",
};

// A tiny in-memory catalog so the search→cards step has something to format.
// Shape matches the assistant projection the store API returns (#19).
const CATALOG_FIXTURE = [
	{
		id: 101,
		slug: "now-foods-magnesium-glycinate",
		name: "NOW Foods Magnesium Glycinate 200mg",
		price: 89000,
		image: "https://example.com/mag.jpg",
		brand: "NOW Foods",
		stockStatus: "in_stock",
	},
	{
		id: 102,
		slug: "solgar-omega-3-700",
		name: "Solgar Omega-3 700mg",
		price: 145000,
		image: "https://example.com/omega.jpg",
		brand: "Solgar",
		stockStatus: "low_stock",
	},
	{
		id: 103,
		slug: "now-vitamin-d3-5000",
		name: "NOW Vitamin D-3 5000 IU",
		price: 62000,
		image: "https://example.com/d3.jpg",
		brand: "NOW Foods",
		stockStatus: "in_stock",
	},
];

function contentTypeFor(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase() ?? "";
	return CONTENT_TYPE_BY_EXT[ext] ?? "image/jpeg";
}

function resolveImagePath(): string {
	const arg = process.argv.slice(2).find((a) => !a.startsWith("-"));
	if (arg) {
		const candidate = arg.startsWith("/") ? arg : join(process.cwd(), arg);
		if (!existsSync(candidate)) {
			console.error(C.red(`✗ image not found: ${candidate}`));
			process.exit(2);
		}
		return candidate;
	}
	const fallback = join(REPO_ROOT, "(1).jpg");
	if (!existsSync(fallback)) {
		console.error(
			C.red(
				`✗ no image given and no default at ${fallback}.\n  usage: bun cli/photo-identify.ts <imagePath>`,
			),
		);
		process.exit(2);
	}
	return fallback;
}

// Serves the image (stand-in for the Meta CDN url) and a catalog fixture the
// worker's product search reads via STORE_API_URL.
function startFixtureServer(imageBytes: Uint8Array, imageType: string) {
	return Bun.serve({
		port: FIXTURE_PORT,
		hostname: "127.0.0.1",
		fetch(req) {
			const url = new URL(req.url);
			if (url.pathname === "/image") {
				return new Response(imageBytes, {
					headers: { "content-type": imageType },
				});
			}
			// tRPC GET for the assistant product search / by-ids procedures.
			if (url.pathname.includes("product.")) {
				return Response.json({
					result: { data: SuperJSON.serialize(CATALOG_FIXTURE) },
				});
			}
			return new Response("not found", { status: 404 });
		},
	});
}

async function main(): Promise<void> {
	const imagePath = resolveImagePath();
	const imageBytes = new Uint8Array(readFileSync(imagePath));
	const imageType = contentTypeFor(imagePath);

	console.log(C.bold("\n  Photo identification proof (#20)"));
	console.log(C.dim(`  worker   ${WORKER_URL}`));
	console.log(
		C.dim(
			`  image    ${basename(imagePath)} (${imageType}, ${imageBytes.byteLength} bytes)`,
		),
	);
	console.log(C.dim(`  catalog  in-memory fixture on :${FIXTURE_PORT}\n`));

	const server = startFixtureServer(imageBytes, imageType);
	const imageUrl = `http://127.0.0.1:${FIXTURE_PORT}/image`;

	let response: Response;
	try {
		response = await fetch(`${WORKER_URL}/messenger/photo-probe`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ imageUrl }),
		});
	} catch (error) {
		console.error(
			C.red(
				`  ✗ could not reach worker at ${WORKER_URL} — boot it first (bun run photo:proof).`,
			),
		);
		console.error(C.dim(`  ${error instanceof Error ? error.message : error}`));
		server.stop();
		process.exit(1);
	}

	const body = (await response.json()) as Record<string, unknown>;
	server.stop();

	if (!response.ok) {
		console.error(C.red(`  ✗ photo-probe ${response.status}: ${body.error}`));
		process.exit(1);
	}

	const queries = (body.queries as string[]) ?? [];
	const cards = (body.cards as unknown[]) ?? [];

	console.log(`  ${C.cyan("R2 key")}        ${body.key}`);
	console.log(
		C.dim(`                (${body.contentType}, ${body.size} bytes — not a CDN url, not base64)`),
	);
	console.log(`  ${C.cyan("vision facts")}  ${body.facts}`);
	console.log(`  ${C.cyan("queries")}       ${JSON.stringify(queries)}`);
	console.log(
		`  ${C.cyan("used query")}    ${body.usedQuery ?? "(none)"} → ${body.matchCount} match(es)`,
	);
	if (body.searchError) {
		console.log(C.red(`  search error  ${body.searchError}`));
	}
	console.log(`\n  ${C.cyan("card payloads")} (same shape as #19 text search):`);
	console.log(JSON.stringify(cards, null, 2));

	const ok =
		typeof body.facts === "string" &&
		body.facts.length > 0 &&
		!body.searchError;
	console.log(
		`\n  ${ok ? C.green("✓ PHOTO IDENTIFICATION PROOF PASSED") : C.red("✗ PROOF INCOMPLETE")}\n`,
	);
	process.exit(ok ? 0 : 1);
}

void main();
