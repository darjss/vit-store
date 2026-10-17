import { getAgentByName } from "agents";
import * as v from "valibot";
import type { Admin } from "./admin/admin";
import { telegramUpdateSchema } from "./admin/telegram";
import type { Env } from "./env";
import { errorFields, logError } from "./log";

const bearerOk = (request: Request, env: Env): boolean =>
	request.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN ?? ""}` &&
	env.ADMIN_TOKEN !== undefined;

// Telegram sends the webhook secret verbatim in this header; compare exactly.
const telegramSecretOk = (request: Request, env: Env): boolean => {
	const secret = env.TELEGRAM_WEBHOOK_SECRET;
	return (
		secret !== undefined &&
		secret !== "" &&
		request.headers.get("x-telegram-bot-api-secret-token") === secret
	);
};

const telegramChatId = (update: v.InferOutput<typeof telegramUpdateSchema>): number | undefined =>
	update.message?.chat.id ?? update.callback_query?.message?.chat.id;

const telegramWebhook = async (request: Request, env: Env): Promise<Response> => {
	if (!telegramSecretOk(request, env)) {
		return new Response("unauthorized", { status: 401 });
	}
	const parsed = v.safeParse(telegramUpdateSchema, await request.json().catch(() => null));
	if (!parsed.success) {
		return new Response("bad request", { status: 400 });
	}
	const chatId = telegramChatId(parsed.output);
	if (chatId === undefined) {
		return Response.json({ ok: true });
	}
	const admin = await getAgentByName(env.Admin, `telegram:${chatId}`);
	try {
		await admin.handleUpdate(parsed.output);
	} catch (error) {
		// Admission failures (e.g. photo staging) surface as non-2xx so
		// Telegram retries instead of the update being dropped.
		logError({ error: errorFields(error), event: "error", where: "telegram_webhook" });
		return new Response("error", { status: 500 });
	}
	return Response.json({ ok: true });
};

const adminRoute = async (request: Request, env: Env, url: URL): Promise<Response> => {
	if (!bearerOk(request, env)) {
		return new Response("unauthorized", { status: 401 });
	}
	// Thread ids are "zernio:<account>:<conversation>" — the route tail is
	// URL-encoded at the client, decoded here.
	const match = /^\/admin\/conversations(?:\/([^/]+)(\/resume|\/transcript)?)?$/.exec(url.pathname);
	if (match === null) {
		return new Response("not found", { status: 404 });
	}
	const [, encoded, tail] = match;
	if (encoded === undefined) {
		if (request.method !== "GET") {
			return new Response("not found", { status: 404 });
		}
		const raw = Number(url.searchParams.get("since") ?? "0");
		const ingress = await getAgentByName(env.Ingress, "default");
		return Response.json(await ingress.adminList(Number.isFinite(raw) ? raw : 0));
	}
	const conversation = await getAgentByName(env.Conversation, decodeURIComponent(encoded));
	if (tail === "/resume" && request.method === "POST") {
		return Response.json(await conversation.adminResume());
	}
	if (tail === "/transcript" && request.method === "GET") {
		return Response.json(await conversation.adminTranscript());
	}
	if (tail === undefined && request.method === "GET") {
		return Response.json(await conversation.adminSnapshot());
	}
	return new Response("not found", { status: 404 });
};

const adminTelegramTranscript = async (
	request: Request,
	env: Env,
	chatId: string,
): Promise<Response> => {
	if (!bearerOk(request, env)) {
		return new Response("unauthorized", { status: 401 });
	}
	if (!/^-?\d+$/.test(chatId)) {
		return new Response("not found", { status: 404 });
	}
	const admin = await getAgentByName<Env, Admin>(env.Admin, `telegram:${chatId}`);
	return Response.json(await admin.adminTranscript());
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "POST" && url.pathname === "/zernio/webhook") {
			const ingress = await getAgentByName(env.Ingress, "default");
			return ingress.fetch(request);
		}
		if (request.method === "POST" && url.pathname === "/telegram/webhook") {
			return telegramWebhook(request, env);
		}
		if (request.method === "GET" && url.pathname === "/health") {
			return Response.json({ ok: true, worker: "vit-store-messenger" });
		}
		if (url.pathname.startsWith("/admin/conversations")) {
			return adminRoute(request, env, url);
		}
		const telegramTranscript = /^\/admin\/telegram\/([^/]+)\/transcript$/.exec(url.pathname);
		if (request.method === "GET" && telegramTranscript !== null) {
			return adminTelegramTranscript(request, env, telegramTranscript[1] ?? "");
		}
		return new Response("not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

export { Admin } from "./admin/admin";
export { Conversation } from "./conversation";
export { Ingress } from "./ingress";
export { PaymentWatch } from "./payment-watch";
export { ChatSdkStateAgent } from "agents/chat-sdk";
