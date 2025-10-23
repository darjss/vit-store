import alchemy from "alchemy";
import { Astro } from "alchemy/cloudflare";
import { config } from "dotenv";

const app = await alchemy("storev2");
const stage = app.stage;
config({ path: `.env.${stage}` });
export const storev2 = await Astro("website",{
  bindings: {
  },
  dev:{
    command: "bun run dev:astro",
  }
});

console.log({
	url: storev2.url,
});

await app.finalize();
