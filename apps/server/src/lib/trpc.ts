import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Context } from "./context";
import { adminAuth } from "./session/admin";
import { auth } from "./session/store";

export const t = initTRPC.context<Context>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError:
					error.cause instanceof ZodError ? error.cause.flatten() : null,
			},
		};
	},
});

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
