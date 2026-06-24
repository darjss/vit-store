/**
 * Post-deploy guard: assert the prod R2 bucket actually carries the
 * `messenger-inbound/` cleanup lifecycle rule, and fail loud if it doesn't.
 *
 * ADR 0003 makes "short-lived" load-bearing for the customer-PII photos staged
 * under `messenger-inbound/` — staging code must never ship without the cleanup
 * also being live. `deploy` applies the rule (`r2:lifecycle:inbound`) and then
 * runs this assertion against the bucket; if the rule is missing the deploy
 * exits non-zero instead of silently shipping photos that would persist forever.
 *
 *   bun scripts/assert-r2-lifecycle.ts
 *
 * Reads the bucket name from wrangler.jsonc and the expected rule id(s) from
 * r2-lifecycle.messenger-inbound.json so the check can't drift from the source.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER_CONFIG = join(AGENT_ROOT, "wrangler.jsonc");
const LIFECYCLE_FILE = join(AGENT_ROOT, "r2-lifecycle.messenger-inbound.json");

const stripJsonc = (text: string): string =>
	text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const bucketName = (() => {
	const config = JSON.parse(stripJsonc(readFileSync(WRANGLER_CONFIG, "utf8")));
	const name = config?.r2_buckets?.[0]?.bucket_name;
	if (typeof name !== "string" || name.length === 0) {
		console.error("Could not read r2_buckets[0].bucket_name from wrangler.jsonc");
		process.exit(2);
	}
	return name as string;
})();

const expectedRuleIds: string[] = (() => {
	const spec = JSON.parse(readFileSync(LIFECYCLE_FILE, "utf8"));
	const ids = (spec?.rules ?? [])
		.map((rule: { id?: unknown }) => rule.id)
		.filter((id: unknown): id is string => typeof id === "string");
	if (ids.length === 0) {
		console.error("No rule ids found in r2-lifecycle.messenger-inbound.json");
		process.exit(2);
	}
	return ids;
})();

const list = Bun.spawnSync(
	[
		"bunx",
		"wrangler",
		"r2",
		"bucket",
		"lifecycle",
		"list",
		bucketName,
		"--config",
		WRANGLER_CONFIG,
	],
	{ cwd: AGENT_ROOT, stdout: "pipe", stderr: "pipe" },
);

const stdout = list.stdout.toString();
const stderr = list.stderr.toString();
if (list.exitCode !== 0) {
	console.error(
		`✗ Could not list lifecycle rules for "${bucketName}" (wrangler exit ${list.exitCode}).`,
	);
	console.error(stderr || stdout);
	process.exit(1);
}

const haystack = `${stdout}\n${stderr}`;
const missing = expectedRuleIds.filter((id) => !haystack.includes(id));
if (missing.length > 0) {
	console.error(
		`✗ R2 bucket "${bucketName}" is MISSING required lifecycle rule(s): ${missing.join(", ")}.`,
	);
	console.error(
		"  Staged customer photos under messenger-inbound/ would persist indefinitely (ADR 0003).",
	);
	console.error("  Apply it with: bun run r2:lifecycle:inbound");
	process.exit(1);
}

console.log(
	`✓ R2 bucket "${bucketName}" carries cleanup rule(s): ${expectedRuleIds.join(", ")}.`,
);
