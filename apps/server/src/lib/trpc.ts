import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";
import { auth } from "./session/store";
import { adminAuth } from "./session/admin";
export const t = initTRPC.context<Context>().create();

export const router = t.router;

const customerAuthMiddleware = t.middleware(async ({ ctx, next }) => {
	const session = await auth(ctx);
	if (!session) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}
	return next({ ctx: { ...ctx, session } });
});
const adminAuthMiddleware = t.middleware(async ({ ctx, next }) => {
	const session = await adminAuth(ctx);
	if (!session) {
		throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
	}
	return next({ ctx: { ...ctx, session } });
});
export const publicProcedure = t.procedure;
export const customerProcedure = t.procedure.use(customerAuthMiddleware);
export const adminProcedure = t.procedure.use(adminAuthMiddleware);