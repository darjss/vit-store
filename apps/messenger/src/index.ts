import { getAgentByName } from "agents";
import type { Env } from "./env";

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "POST" && url.pathname === "/zernio/webhook") {
			const ingress = await getAgentByName(env.Ingress, "default");
			return ingress.fetch(request);
		}
		if (request.method === "GET" && url.pathname === "/health") {
			return Response.json({ ok: true, worker: "vit-store-messenger" });
		}
		return new Response("not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

export { Conversation } from "./conversation";
export { Ingress } from "./ingress";
export { ChatSdkStateAgent } from "agents/chat-sdk";
