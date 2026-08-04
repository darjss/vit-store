import path from "node:path";
import alchemy from "alchemy";
import { Vite } from "alchemy/cloudflare";
import { config } from "dotenv";
import { createAdminAlchemyEnv } from "../../env";

// Bun 1.3.14 crashes when Alchemy's async context crosses top-level await.
async function main() {
	const app = await alchemy("admin");
	const stage = app.stage;

	config({
		path: path.join(import.meta.dirname, `.env.${stage}`),
	});

	const env = createAdminAlchemyEnv(process.env);

	const admin = await Vite("dashboard", {
		domains:
			stage === "prod"
				? ["admin.amerikvitamin.mn"]
				: stage === "staging"
					? ["admin-staging.amerikvitamin.mn"]
					: undefined,
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
	return admin;
}

export const admin = main();
admin.catch((error) => {
	console.error(error);
	process.exit(1);
});
