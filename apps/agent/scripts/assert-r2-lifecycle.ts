/**
 * Post-deploy guard: assert the prod R2 bucket actually carries the
 * `messenger-inbound/` cleanup lifecycle rule, and fail loud if it doesn't.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as v from "valibot";

const wranglerConfigSchema = v.object({
	r2_buckets: v.optional(v.array(v.object({ bucket_name: v.string() }))),
});

const lifecycleSpecSchema = v.object({
	rules: v.optional(v.array(v.object({ id: v.string() }))),
});

const AGENT_ROOT = join(import.meta.dirname, "..");
const WRANGLER_CONFIG = join(AGENT_ROOT, "wrangler.jsonc");
const LIFECYCLE_FILE = join(AGENT_ROOT, "r2-lifecycle.messenger-inbound.json");

const stripJsonc = (text: string): string =>
	text.replaceAll(/\/\*[\s\S]*?\*\//g, "").replaceAll(/(^|[^:])\/\/.*$/gm, "$1");

const bucketName = (() => {
	const config = v.parse(
		wranglerConfigSchema,
		JSON.parse(stripJsonc(readFileSync(WRANGLER_CONFIG, "utf8"))),
	);
	const name = config.r2_buckets?.[0]?.bucket_name;
	if (!name) {
		console.error("Could not read r2_buckets[0].bucket_name from wrangler.jsonc");
		process.exit(2);
	}
	return name;
})();

const expectedRuleIds = (() => {
	const spec = v.parse(lifecycleSpecSchema, JSON.parse(readFileSync(LIFECYCLE_FILE, "utf8")));
	const ids = (spec.rules ?? []).map((rule) => rule.id);
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
	{ cwd: AGENT_ROOT, stderr: "pipe", stdout: "pipe" },
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

console.log(`✓ R2 bucket "${bucketName}" carries cleanup rule(s): ${expectedRuleIds.join(", ")}.`);
