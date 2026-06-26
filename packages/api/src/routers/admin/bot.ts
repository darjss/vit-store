import { router } from "~/lib/trpc";
import { orderBot } from "~/routers/admin/order";

// Bot-facing router: token-authed (X-Admin-Bot-Token) surface for the admin
// Messenger agent Worker. Same resolvers as the admin dashboard router, just a
// different auth gate. Only `order` for the tracer bullet; add more bot-facing
// routers here as the admin agent grows.
export const botRouter = router({
	order: orderBot,
});
export type BotRouter = typeof botRouter;
