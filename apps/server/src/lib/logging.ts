import { initLogger, type RequestLogger } from "evlog";
import { createAxiomDrain } from "evlog/axiom";
import { evlog } from "evlog/hono";
import type { MiddlewareHandler } from "hono";

export type AppRequestLogger = RequestLogger<any>;

export type ServerHonoEnv = {
	Bindings: Env;
	Variables: {
		log: AppRequestLogger;
	};
};

type AxiomEnv = Env & {
	AXIOM_API_KEY?: string;
	AXIOM_TOKEN?: string;
	AXIOM_DATASET?: string;
	AXIOM_EDGE_URL?: string;
	AXIOM_BASE_URL?: string;
	AXIOM_ORG_ID?: string;
	SERVICE_VERSION?: string;
	COMMIT_SHA?: string;
	GIT_COMMIT?: string;
	CF_REGION?: string;
};

initLogger({
	env: {
		service: "vit-store-server",
		environment: process.env.NODE_ENV ?? "production",
	},
	redact: false,
	pretty: false,
	stringify: true,
	sampling: {
		rates: {
			debug: 0,
			info: 100,
			warn: 100,
			error: 100,
		},
		keep: [
			{ status: 400 },
			{ duration: 1000 },
			{ path: "/trpc/**" },
			{ path: "/webhooks/**" },
			{ path: "/upload/**" },
			{ path: "/admin/**" },
		],
	},
});

const axiomDrains = new Map<string, ReturnType<typeof createAxiomDrain>>();

function getAxiomDrain(env: Env) {
	const axiomEnv = env as AxiomEnv;
	const apiKey = axiomEnv.AXIOM_API_KEY ?? axiomEnv.AXIOM_TOKEN;
	const dataset = axiomEnv.AXIOM_DATASET;

	if (!apiKey || !dataset) {
		return undefined;
	}

	const cacheKey = JSON.stringify({
		apiKey,
		dataset,
		edgeUrl: axiomEnv.AXIOM_EDGE_URL,
		baseUrl: axiomEnv.AXIOM_BASE_URL,
		orgId: axiomEnv.AXIOM_ORG_ID,
	});
	const cached = axiomDrains.get(cacheKey);
	if (cached) return cached;

	const drain = createAxiomDrain({
		apiKey,
		dataset,
		orgId: axiomEnv.AXIOM_ORG_ID,
		...(axiomEnv.AXIOM_EDGE_URL
			? { edgeUrl: axiomEnv.AXIOM_EDGE_URL }
			: { baseUrl: axiomEnv.AXIOM_BASE_URL }),
	});
	axiomDrains.set(cacheKey, drain);
	return drain;
}

export function evlogMiddleware(): MiddlewareHandler<ServerHonoEnv> {
	return async (c, next) => {
		const axiomEnv = c.env as AxiomEnv;
		const middleware = evlog({
			exclude: ["/health-check", "/favicon.ico", "/"],
			drain: getAxiomDrain(c.env),
			enrich: (ctx) => {
				ctx.event.runtime = "cloudflare-workers";
				ctx.event.version = axiomEnv.SERVICE_VERSION;
				ctx.event.commit_hash = axiomEnv.COMMIT_SHA ?? axiomEnv.GIT_COMMIT;
				ctx.event.region = axiomEnv.CF_REGION;
			},
			keep: (ctx) => {
				if (ctx.status && ctx.status >= 400) ctx.shouldKeep = true;
				if (ctx.duration && ctx.duration >= 1000) ctx.shouldKeep = true;
				if (ctx.context?.user_type === "admin") ctx.shouldKeep = true;
			},
		});

		return middleware(c, next);
	};
}

export function getRequestLog(c: { get: (key: "log") => AppRequestLogger }) {
	return c.get("log");
}
