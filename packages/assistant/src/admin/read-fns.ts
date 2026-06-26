import { createTRPCClient, httpLink } from "@trpc/client";
import type { BotRouter } from "@vit/api";
import { SuperJSON } from "superjson";

// Builds the fn registry the Codemode sandbox calls as `codemode.<name>(...)`.
// Each fn is a thin wrapper over a typed tRPC client targeting the bot-facing
// /trpc/bot endpoint, authed by the shared X-Admin-Bot-Token header. The
// DynamicWorkerExecutor wraps these plain functions in a ToolDispatcher
// (RpcTarget) internally — no manual RpcTarget needed for the fns path.
//
// Add new read fns here as the admin agent grows. Keep it read-only for the
// tracer bullet.
export function buildReadFns({
	botToken,
	storeApiUrl,
}: {
	botToken: string;
	storeApiUrl: string;
}): Record<string, (...args: unknown[]) => Promise<unknown>> {
	const url = `${storeApiUrl.replace(/\/+$/, "")}/trpc/bot`;
	const botClient = createTRPCClient<BotRouter>({
		links: [
			httpLink({
				url,
				transformer: SuperJSON,
				headers: () => ({ "X-Admin-Bot-Token": botToken }),
			}),
		],
	});

	return {
		// codemode.getPendingOrders() -> pending order list
		getPendingOrders: async () =>
			botClient.order.getPendingOrders.query(),
	};
}
