import { adminAuth } from "@vit/api";
import type { MiddlewareHandler } from "hono";
import { createContext } from "./context";
import type { ServerHonoEnv } from "./logging";

export const requireAdminSession: MiddlewareHandler<ServerHonoEnv> = async (
	c,
	next,
) => {
	const ctx = await createContext({ context: c });
	const session = await adminAuth(ctx);
	if (!session) {
		ctx.log.warn("auth.login_failed", {
			failure_reason: "no_admin_session",
		});
		return c.json({ message: "Unauthorized" }, 401);
	}

	ctx.log.set({
		user: { id: session.user.id, email: session.user.username },
		user_type: "admin",
	});
	await next();
};
