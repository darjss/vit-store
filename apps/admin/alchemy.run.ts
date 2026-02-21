import path from "node:path";
import alchemy from "alchemy";
import { Vite } from "alchemy/cloudflare";
import { config } from "dotenv";
import { createAdminAlchemyEnv } from "../../env";

const app = await alchemy("admin");
const stage = app.stage;

config({
	path: path.join(import.meta.dirname, `.env.${stage}`),
});

const env = createAdminAlchemyEnv(process.env);

export const admin = await Vite("dashboard", {
	domains: stage === "prod" ? ["admin.amerikvitamin.mn"] : undefined,
	cwd: import.meta.dirname,
	adopt: true,
	assets: "dist",
	bindings: {
		VITE_SERVER_URL: env.VITE_SERVER_URL,
	},
	dev: {
		command: "bun run dev:vite",
	},
});

await app.finalize();
