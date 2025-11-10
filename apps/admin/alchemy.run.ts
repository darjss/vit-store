import alchemy from "alchemy";
import { Vite } from "alchemy/cloudflare";

const app = await alchemy("admin");
const stage = app.stage;

console.log("Admin Stage:", stage, process.env.VITE_SERVER_URL);
export const admin = await Vite("dashboard", {
	cwd: import.meta.dirname,
	assets: "dist",
	bindings: {
		VITE_SERVER_URL: process.env.VITE_SERVER_URL || "",
	},
	dev: {
		command: "bun run dev:vite",
	},
});

console.log(`Admin  -> ${admin.url}`);

await app.finalize();
