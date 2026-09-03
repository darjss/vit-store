import path from "node:path";
import alchemy from "alchemy";
import { Vite } from "alchemy/cloudflare";
import { config } from "dotenv";
import { createAdminAlchemyEnv } from "../../env";

const app = await alchemy("admin");
const stage = app.stage;

config({
	path: path.join(import.meta.dirname, "..", "..", `.env.${stage}`),
});

const env = createAdminAlchemyEnv(process.env);

export const admin = await Vite("dashboard", {
	adopt: true,
	assets: "dist",
	bindings: {
		VITE_SERVER_URL: env.VITE_SERVER_URL,
	},
	// Alchemy Vite defaults to `bunx vite build`; this app builds via Vite+ (`vp build`).
	build: {
		command: "bun run build",
	},
	cwd: import.meta.dirname,
	dev: {
		command: "bun run dev:vite",
	},
	domains:
		stage === "prod"
			? ["admin.amerikvitamin.mn"]
			: stage === "staging"
				? ["admin-staging.amerikvitamin.mn"]
				: undefined,
});

await app.finalize();
