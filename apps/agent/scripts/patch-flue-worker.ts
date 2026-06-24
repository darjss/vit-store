/**
 * Postbuild workaround for a Flue beta (target: cloudflare) bundling bug.
 *
 * Rolldown's runtime chunk emits `createRequire(import.meta.url)` eagerly at
 * module top level. In workerd `import.meta.url` is `undefined`, so the call
 * throws (`The argument 'path' ... Received 'undefined'`) and the Worker dies
 * at startup. The require functions are never actually invoked at runtime on
 * workerd (the only call sites are dead Node/Bun branches), so it is safe to
 * guard the construction. Remove this once Flue ships a fix upstream.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NEEDLE = "createRequire(import.meta.url)";
const REPLACEMENT = 'createRequire(import.meta.url || "file:///worker.js")';

const assetsDir = join(
	import.meta.dir,
	"..",
	"dist",
	"vit_store_agent",
	"assets",
);

let patched = 0;
let alreadySafe = 0;
for (const name of readdirSync(assetsDir)) {
	if (!name.startsWith("rolldown-runtime-") || !name.endsWith(".js")) continue;
	const file = join(assetsDir, name);
	const code = readFileSync(file, "utf8");
	if (!code.includes(NEEDLE)) {
		alreadySafe++;
		continue;
	}
	writeFileSync(file, code.split(NEEDLE).join(REPLACEMENT));
	patched++;
	console.log(`[patch-flue-worker] guarded createRequire in ${name}`);
}

if (patched === 0 && alreadySafe === 0) {
	console.warn(
		"[patch-flue-worker] no rolldown-runtime chunk found — Flue output layout changed; verify the worker still boots.",
	);
}
