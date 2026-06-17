import path from "node:path";
import alchemy from "alchemy";
import { Astro } from "alchemy/cloudflare";
import { config } from "dotenv";
import { server } from "server/alchemy";
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
	bindings: {
		// images: images
		server: server,
		PUBLIC_API_URL: env.PUBLIC_API_URL,
	},
	adopt: true,
	domains: stage === "prod" ? ["amerikvitamin.mn"] : undefined,
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
