#!/usr/bin/env bun
import { mkdirSync, mkdtempSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { analyticsCacheKeys } from "../packages/api/src/lib/cache/kv-cache-key";

type Environment = "local" | "staging" | "production";

type Options = {
	environment: Environment;
	scope: "analytics";
	namespaceId: string;
	accountId?: string;
	persistTo?: string;
	confirm?: string;
	confirmProduction?: string;
};

const USAGE = `Usage:
  bun run cache:maintain -- --environment local --scope analytics --namespace-id <unique-local-name> --persist-to <absolute-path> [--confirm local:<unique-local-name>]
  bun run cache:maintain -- --environment staging --scope analytics --account-id <account-id> --namespace-id <namespace-id> [--confirm staging:<account-id>:<namespace-id>]
  bun run cache:maintain -- --environment production --scope analytics --account-id <account-id> --namespace-id <namespace-id> [--confirm production:<account-id>:<namespace-id> --confirm-production DELETE-PRODUCTION-CACHE]

Without confirmation, the command only previews the selected scope. No environment is selected by default.`;

function fail(message: string): never {
	console.error(`${message}\n\n${USAGE}`);
	process.exit(1);
}

const OPTION_NAMES = new Set([
	"--environment",
	"--scope",
	"--namespace-id",
	"--account-id",
	"--persist-to",
	"--confirm",
	"--confirm-production",
]);

function parseValues(args: string[]): Map<string, string> {
	const values = new Map<string, string>();
	for (let index = 0; index < args.length; index += 2) {
		const flag = args[index];
		const value = args[index + 1];
		if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
			fail("Every option requires an explicit value.");
		}
		if (!OPTION_NAMES.has(flag)) fail(`Unknown option: ${flag}`);
		if (values.has(flag)) fail(`Duplicate option: ${flag}`);
		values.set(flag, value);
	}
	return values;
}

function parseEnvironment(value?: string): Environment {
	if (value === "local" || value === "staging" || value === "production") {
		return value;
	}
	fail("--environment must be local, staging, or production.");
}

function validateBoundary(options: Options): void {
	if (options.environment === "local") {
		if (options.accountId)
			fail("--account-id is not valid for local maintenance.");
		if (!options.persistTo || !isAbsolute(options.persistTo)) {
			fail("Local maintenance requires an absolute --persist-to path.");
		}
		return;
	}
	if (!options.accountId) {
		fail(`--account-id is required for ${options.environment}.`);
	}
	if (options.persistTo)
		fail("--persist-to is only valid for local maintenance.");
}

function parseOptions(args: string[]): Options {
	const values = parseValues(args);
	if (values.get("--scope") !== "analytics") fail("--scope must be analytics.");
	const namespaceId = values.get("--namespace-id");
	if (!namespaceId) fail("--namespace-id is required.");

	const options: Options = {
		environment: parseEnvironment(values.get("--environment")),
		scope: "analytics",
		namespaceId,
		accountId: values.get("--account-id"),
		persistTo: values.get("--persist-to"),
		confirm: values.get("--confirm"),
		confirmProduction: values.get("--confirm-production"),
	};
	validateBoundary(options);
	return options;
}

function runWrangler(args: string[], accountId?: string): string {
	const isolatedCwd = mkdtempSync(join(tmpdir(), "vit-cache-maintenance-"));
	const wrangler = Bun.which("wrangler");
	if (!wrangler) fail("Wrangler is not installed or available on PATH.");
	const env: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		HOME: process.env.HOME ?? "",
		WRANGLER_SEND_METRICS: "false",
	};
	if (process.env.XDG_CONFIG_HOME)
		env.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;
	if (accountId) env.CLOUDFLARE_ACCOUNT_ID = accountId;

	try {
		const result = Bun.spawnSync({
			cmd: [wrangler, ...args, "--cwd", isolatedCwd],
			env,
			stdout: "pipe",
			stderr: "pipe",
		});
		if (!result.success) {
			const message = result.stderr.toString().trim() || "Wrangler failed.";
			throw new Error(message);
		}
		return result.stdout.toString();
	} finally {
		rmdirSync(isolatedCwd);
	}
}

function wranglerTarget(options: Options): string[] {
	const target = ["--namespace-id", options.namespaceId];
	if (options.environment === "local") {
		mkdirSync(options.persistTo as string, { recursive: true });
		target.push("--local", "--persist-to", options.persistTo as string);
	} else {
		target.push("--remote");
	}
	return target;
}

async function main() {
	const options = parseOptions(process.argv.slice(2));
	const keys = await analyticsCacheKeys();
	const expectedConfirmation =
		options.environment === "local"
			? `local:${options.namespaceId}`
			: `${options.environment}:${options.accountId}:${options.namespaceId}`;

	console.log(`Environment: ${options.environment}`);
	console.log(`Scope: ${options.scope} (${keys.length} keys)`);
	console.log(`Namespace: ${options.namespaceId}`);
	if (options.environment === "local") {
		console.log(`Persistence: ${options.persistTo}`);
	}

	if (!options.confirm) {
		console.log("Preview only: no cache mutation performed.");
		return;
	}
	if (options.confirm !== expectedConfirmation) {
		fail(`--confirm must exactly match ${expectedConfirmation}.`);
	}
	if (
		options.environment === "production" &&
		options.confirmProduction !== "DELETE-PRODUCTION-CACHE"
	) {
		fail(
			"Production mutation also requires --confirm-production DELETE-PRODUCTION-CACHE.",
		);
	}
	if (
		options.environment !== "production" &&
		options.confirmProduction !== undefined
	) {
		fail("--confirm-production is only valid for production maintenance.");
	}

	const target = wranglerTarget(options);
	for (const key of keys) {
		runWrangler(["kv", "key", "delete", key, ...target], options.accountId);
	}
	console.log(
		`Deleted ${keys.length} selected keys from ${options.environment}.`,
	);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
