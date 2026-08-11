/**
 * PROTOTYPE — one-command static server for the admin-v2 UI prototype.
 * Run:  bun serve.ts   then open http://localhost:4173
 */
import { serve, file } from "bun";

const PORT = 4173;

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    const f = file(import.meta.dir + path);
    if (await f.exists()) {
      return new Response(f);
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`\n  Admin V2 UI prototype → http://localhost:${PORT}  (variant via ?variant=A|B|C)\n`);
