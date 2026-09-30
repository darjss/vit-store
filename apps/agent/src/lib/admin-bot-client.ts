import { createTRPCClient, httpLink } from "@trpc/client";
import type { BotRouter } from "@vit/api";
import { SuperJSON } from "superjson";

export const createAdminBotClient = (storeApiUrl: string, botToken: string) => {
	const url = `${storeApiUrl.replace(/\/+$/, "")}/trpc/bot`;
	return createTRPCClient<BotRouter>({
		links: [
			httpLink({
				headers: () => ({ "X-Admin-Bot-Token": botToken }),
				transformer: SuperJSON,
				url,
			}),
		],
	});
};
