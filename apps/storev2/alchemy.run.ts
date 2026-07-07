import path from "node:path";
import alchemy from "alchemy";
import { Astro, WorkerRef } from "alchemy/cloudflare";
import { config } from "dotenv";
import { createStoreAlchemyEnv } from "../../env";

const app = await alchemy("storev2");
const stage = app.stage;

// const images = Images({
// 	dev: {
// 		remote:true
// 	}
// });

config({
	path: path.join(import.meta.dirname, "..", "..", `.env.${stage}`),
});

const env = createStoreAlchemyEnv(process.env);

console.log("stage", stage, env.PUBLIC_API_URL);

export const storev2 = await Astro("front", {
	// The Cloudflare adapter generates a Pages-style _routes.json. This app is
	// deployed as a Worker with static assets via Alchemy, where assets are
	// already served before the Worker. Keeping _routes.json has caused
	// prerendered clean-slash routes like /, /login/, and /cart/ to be routed
	// to Astro's stripped prerender modules and hang with no bytes.
	build: {
		command: "bun run build && rm -f dist/_routes.json",
	},
	// @astrojs/cloudflare v14 emits the server bundle at dist/server/entry.mjs and
	// client assets at dist/client (Alchemy's Astro resource still defaults to the
	// legacy v12 dist/_worker.js layout, so override both explicitly).
	entrypoint: "dist/server/entry.mjs",
	assets: "dist/client",
	bindings: {
		// Reference the already-deployed server Worker by physical service name.
		// Importing server/alchemy here causes store deploys to evaluate/deploy the
		// server app first, which can hang when Cloudflare's API is degraded.
		server: WorkerRef({ service: `server-api-${stage}` }),
		PUBLIC_API_URL: env.PUBLIC_API_URL,
	},
	adopt: true,
	domains:
		stage === "prod"
			? ["amerikvitamin.mn"]
			: stage === "staging"
				? ["staging.amerikvitamin.mn"]
				: undefined,
	observability: {
		enabled: false,
		logs: {
			enabled: true,
			persist: true,
		},
		traces: {
			enabled: true,
			persist: true,
		},
	},
});

console.log({
	url: storev2.url,
});

await app.finalize();
