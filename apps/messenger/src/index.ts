import { getAgentByName } from "agents";
import type { Env } from "./env";

const bearerOk = (request: Request, env: Env): boolean =>
	request.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN ?? ""}` &&
	env.ADMIN_TOKEN !== undefined;

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
		if (url.pathname.startsWith("/admin/conversations")) {
			if (!bearerOk(request, env)) {
				return new Response("unauthorized", { status: 401 });
			}
			// Thread ids are "zernio:<account>:<conversation>" — the route tail is
			// URL-encoded at the client, decoded here.
			const match = /^\/admin\/conversations(?:\/([^/]+)(\/resume)?)?$/.exec(url.pathname);
			if (match === null) {
				return new Response("not found", { status: 404 });
			}
			const [, encoded, resume] = match;
			if (encoded === undefined) {
				if (request.method !== "GET") {
					return new Response("not found", { status: 404 });
				}
				const ingress = await getAgentByName(env.Ingress, "default");
				return Response.json(await ingress.adminList());
			}
			const conversation = await getAgentByName(env.Conversation, decodeURIComponent(encoded));
			if (resume === "/resume" && request.method === "POST") {
				return Response.json(await conversation.adminResume());
			}
			if (resume === undefined && request.method === "GET") {
				return Response.json(await conversation.adminSnapshot());
			}
			return new Response("not found", { status: 404 });
		}
		return new Response("not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

export { Conversation } from "./conversation";
export { Ingress } from "./ingress";
export { ChatSdkStateAgent } from "agents/chat-sdk";
