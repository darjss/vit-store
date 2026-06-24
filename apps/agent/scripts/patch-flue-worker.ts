/**
 * Postbuild workaround for a Flue beta (target: cloudflare) bundling bug.
 *
 * Rolldown's runtime chunk emits `createRequire(import.meta.url)` eagerly at
 * module top level. In workerd `import.meta.url` is `undefined`, so the call
 * throws (`The argument 'path' ... Received 'undefined'`) and the Worker dies
 * at startup. The require functions are never actually invoked at runtime on
 * workerd (the only call sites are dead Node/Bun branches), so it is safe to
 * guard the construction.
 *
 * This script guards on the real invariant — the dangerous NEEDLE string —
 * not on an incidental chunk filename, and FAILS THE BUILD (exit 1) if it
 * cannot do its job, so a future Flue change can never silently ship an
 * un-bootable worker. When Flue fixes this upstream the needle disappears;
 * set FLUE_BOOT_PATCH_OPTIONAL=1 to turn that into a clean pass and then
 * delete this script.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NEEDLE = "createRequire(import.meta.url)";
const GUARDED = 'createRequire(import.meta.url || "file:///worker.js")';
const GUARD_MARKER = "createRequire(import.meta.url ||";

const assetsDir = join(
	import.meta.dir,
	"..",
	"dist",
	"vit_store_agent",
	"assets",
);

if (!existsSync(assetsDir)) {
	console.error(
		`[patch-flue-worker] assets dir not found: ${assetsDir}\n` +
			"Run the Flue build first (the dist layout may have changed).",
	);
	process.exit(1);
}

let patched = 0;
let alreadyGuarded = 0;
for (const name of readdirSync(assetsDir)) {
	if (!name.endsWith(".js")) continue;
	const file = join(assetsDir, name);
	const code = readFileSync(file, "utf8");
	if (code.includes(NEEDLE)) {
		writeFileSync(file, code.split(NEEDLE).join(GUARDED));
		patched++;
		console.log(`[patch-flue-worker] guarded createRequire in ${name}`);
	} else if (code.includes(GUARD_MARKER)) {
		alreadyGuarded++;
	}
}

// Verify the job is done: no unguarded needle may survive in any chunk.
for (const name of readdirSync(assetsDir)) {
	if (!name.endsWith(".js")) continue;
	if (readFileSync(join(assetsDir, name), "utf8").includes(NEEDLE)) {
		console.error(
			`[patch-flue-worker] FAILED: unguarded ${NEEDLE} still present in ${name}.`,
		);
		process.exit(1);
	}
}

if (patched === 0 && alreadyGuarded === 0) {
	if (process.env.FLUE_BOOT_PATCH_OPTIONAL === "1") {
		console.warn(
			"[patch-flue-worker] no createRequire(import.meta.url) found — Flue may have fixed this upstream; safe to delete this script.",
		);
	} else {
		console.error(
			"[patch-flue-worker] FAILED: expected createRequire(import.meta.url) in the bundle but found none.\n" +
				"Either Flue changed the bundle (re-verify the worker boots) or fixed it upstream.\n" +
				"If upstream-fixed, re-run with FLUE_BOOT_PATCH_OPTIONAL=1 and then remove this workaround.",
		);
		process.exit(1);
	}
}
