/**
 * Boot the real agent worker, run a command against it, tear it down.
 *
 * This is the "run it correctly" glue so the dev CLI is one command:
 *   bun run dev:messenger   → worker + interactive CLI
 *   bun run smoke           → worker + CLI --smoke (headless, exit code)
 *
 * It does NOT reimplement any Messenger logic — it just builds, boots the
 * worker (with the AI binding pointed at real Cloudflare so the agent actually
 * replies, while Durable Objects stay local), waits for health, then execs the
 * given command and forwards its exit code.
 *
 *   bun scripts/with-worker.ts -- <command...>
 *   --local        boot with `wrangler dev --local` (no Workers AI; no real
 *                  reply — sets SMOKE_EXPECT_REPLY=0 for the child)
 *   WITH_WORKER_SKIP_BUILD=1   reuse the existing dist build
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_WRANGLER = join(AGENT_ROOT, "dist/vit_store_agent/wrangler.json");
const DEV_VARS = join(AGENT_ROOT, ".dev.vars");
const PORT = 3583; // the CLI's default worker URL
const CAPTURE_PORT = 8788; // the CLI's default capture port

// Everything that isn't a known flag or the optional `--` separator is the
// command to run (robust to `bun run` swallowing the `--`).
const argv = process.argv.slice(2);
const local = argv.includes("--local");
const command = argv.filter((a) => a !== "--local" && a !== "--");
if (command.length === 0) {
	console.error("usage: bun scripts/with-worker.ts [--local] -- <command...>");
	process.exit(2);
}

// A local dev .dev.vars so signature verify + capture redirect line up. Created
// only if absent (never clobbers a real one). Outbound is redirected to the
// CLI's capture port so no real Meta token is needed.
if (!existsSync(DEV_VARS)) {
	writeFileSync(
		DEV_VARS,
		[
			"MESSENGER_APP_SECRET=dev_local_secret",
			"MESSENGER_VERIFY_TOKEN=dev_verify_token",
			"MESSENGER_PAGE_ID=DEV_PAGE_ID",
			"MESSENGER_PAGE_ACCESS_TOKEN=DEV_PAGE_TOKEN",
			`MESSENGER_GRAPH_BASE_URL=http://127.0.0.1:${CAPTURE_PORT}`,
			"",
		].join("\n"),
	);
	console.log("• wrote a default apps/agent/.dev.vars for local dev");
}

if (process.env.WITH_WORKER_SKIP_BUILD !== "1") {
	console.log("• building agent…");
	if (Bun.spawnSync(["bun", "run", "build"], { cwd: AGENT_ROOT, stdout: "inherit", stderr: "inherit" }).exitCode !== 0) {
		console.error("✗ build failed");
		process.exit(1);
	}
}
if (!existsSync(DIST_WRANGLER)) {
	console.error(`✗ no build at ${DIST_WRANGLER}`);
	process.exit(1);
}

// Real Workers AI (Kimi) while DOs stay local: experimental remote AI binding.
if (!local) {
	const cfg = JSON.parse(readFileSync(DIST_WRANGLER, "utf8"));
	cfg.ai = { binding: "AI", experimental_remote: true };
	writeFileSync(DIST_WRANGLER, JSON.stringify(cfg, null, 2));
}

console.log(`• booting worker on :${PORT}${local ? " (--local, no Workers AI)" : " (real Workers AI)"}…`);
const worker = Bun.spawn(
	["bunx", "wrangler", "dev", "--config", DIST_WRANGLER, "--port", String(PORT), ...(local ? ["--local"] : [])],
	{ cwd: AGENT_ROOT, stdout: "pipe", stderr: "pipe" },
);

async function healthy(timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			if ((await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(2000) })).ok) return true;
		} catch {}
		await Bun.sleep(1000);
	}
	return false;
}

let code = 1;
try {
	if (!(await healthy(45000))) {
		console.error("✗ worker did not become healthy");
	} else {
		console.log("• worker ready\n");
		const child = Bun.spawn(command, {
			cwd: AGENT_ROOT,
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
			env: { ...process.env, ...(local ? { SMOKE_EXPECT_REPLY: "0" } : {}) },
		});
		code = await child.exited;
	}
} finally {
	worker.kill();
}
process.exit(code);
