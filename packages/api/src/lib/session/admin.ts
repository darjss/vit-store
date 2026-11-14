import { sha256 } from "@oslojs/crypto/sha2";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "~/db/client";
import { OpsTokensTable, UsersTable } from "~/db/schema";
import type { Context } from "~/lib/context";
import { createUserSessionManager } from "~/lib/session/index";
import { sessionUserWireSchema } from "~/lib/session/wire-schemas";

const adminSessionManager = createUserSessionManager({
	cookieName: "admin_session",
	kvSessionPrefix: "admin_session",
	kvUserSessionPrefix: "admin_user_sessions",
	userSchema: sessionUserWireSchema,
	// 30-day rolling session: any activity in the second half of the window
	// (last 15d) extends the session by another 30d, so an active admin stays
	// logged in for up to 30d since their last request. Previously this was 24h
	// with a 2h renewal window, forcing daily re-logins.
	renewalThresholdMs: 1000 * 60 * 60 * 24 * 15,
	sessionDurationMs: 1000 * 60 * 60 * 24 * 30,
});

const {
	auth: cookieAuth,
	createSession: createAdminSession,
	deleteSessionTokenCookie: deleteAdminSessionTokenCookie,
	invalidateSession: invalidateAdminSession,
	setSessionTokenCookie: setAdminSessionTokenCookie,
} = adminSessionManager;

/**
 * Scripts send `Authorization: Bearer <ops token>` instead of a browser cookie.
 * The token acts as the approved admin who minted it until it expires. Mint,
 * list and revoke tokens with vit-playground's api-scripts/ops-token.ts.
 */
const opsTokenAuth = async (ctx: Context) => {
	const header = ctx.c.req.header("authorization");
	if (!header?.startsWith("Bearer ")) {
		return null;
	}
	const tokenHash = encodeHexLowerCase(sha256(new TextEncoder().encode(header.slice(7))));
	const [row] = await db()
		.select({ token: OpsTokensTable, user: UsersTable })
		.from(OpsTokensTable)
		.innerJoin(UsersTable, eq(OpsTokensTable.userId, UsersTable.id))
		.where(
			and(
				eq(OpsTokensTable.tokenHash, tokenHash),
				gt(OpsTokensTable.expiresAt, new Date()),
				eq(UsersTable.isApproved, true),
				isNull(UsersTable.deletedAt),
			),
		)
		.limit(1);
	if (!row) {
		return null;
	}
	ctx.log.set({ ops_token: row.token.name });
	return { expiresAt: row.token.expiresAt, id: `ops:${row.token.id}`, user: row.user };
};

const adminAuth = async (ctx: Context) => (await cookieAuth(ctx)) ?? (await opsTokenAuth(ctx));

export {
	adminAuth,
	createAdminSession,
	deleteAdminSessionTokenCookie,
	invalidateAdminSession,
	setAdminSessionTokenCookie,
};
