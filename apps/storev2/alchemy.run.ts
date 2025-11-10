import alchemy from "alchemy";
import { Astro } from "alchemy/cloudflare";
import { config } from "dotenv";
import path from "path";
import { server } from "server/alchemy";

const app = await alchemy("storev2");
const stage = app.stage;

config({
	path: path.join(import.meta.dirname, "..", "..", `.env.${stage}`),
});

console.log("stage", stage, process.env.PUBLIC_API_URL);
export const storev2 = await Astro("front", {
	bindings: {
		server: server,
		PUBLIC_API_URL: process.env.PUBLIC_API_URL || "",
	},
	domains: stage === "dev" ? ["vitstore.dev"] : undefined,
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
