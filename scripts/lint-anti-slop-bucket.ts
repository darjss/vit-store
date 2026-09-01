#!/usr/bin/env bun
/**
 * Count anti-slop lint errors grouped by rule and path prefix.
 * Usage: bun scripts/lint-anti-slop-bucket.ts [optional path prefix]
 */
import { $ } from "bun";

const prefix = process.argv[2] ?? "";
const lint = await $`bunx vp lint ${prefix}`.quiet().nothrow();
const lines = lint.stderr.toString().split("\n").concat(lint.stdout.toString().split("\n"));

const byRule = new Map<string, number>();
const byPath = new Map<string, number>();
let total = 0;

for (const line of lines) {
	const match = line.match(/^(?<path>[^:]+):\d+:\d+: error anti-slop\((?<rule>[^)]+)\):/);
	if (!match?.groups) continue;
	total += 1;
	const { path, rule } = match.groups;
	byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
	const top = path.split("/").slice(0, 2).join("/");
	byPath.set(top, (byPath.get(top) ?? 0) + 1);
}

console.log(`anti-slop total: ${total}${prefix ? ` (prefix: ${prefix})` : ""}\n`);

console.log("by rule:");
for (const [rule, count] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
	console.log(`  ${count}\t${rule}`);
}

console.log("\nby path prefix:");
for (const [path, count] of [...byPath.entries()].sort((a, b) => b[1] - a[1])) {
	console.log(`  ${count}\t${path}`);
}

process.exit(total > 0 ? 1 : 0);
