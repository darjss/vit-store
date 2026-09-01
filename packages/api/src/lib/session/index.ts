import { sha256 } from "@oslojs/crypto/sha2";
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from "@oslojs/encoding";

import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import * as v from "valibot";
import type { Context, CustomerSelectType, UserSelectType } from "~/lib/context";
import type { HonoContextType, SessionConfig } from "~/lib/types";

export interface Session<TUser = CustomerSelectType | UserSelectType> {
	expiresAt: Date;
	id: string;
	user: TUser;
}

function optionalCookieDomain(domain: string | undefined): string | undefined {
	return domain && domain.length > 0 ? domain : undefined;
}

export function generateSessionToken(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

function getUserIdentifier<TUser extends CustomerSelectType | UserSelectType>(user: TUser): string {
	if ("phone" in user && user.phone) {
		return user.phone.toString();
	}
	if ("id" in user && user.id) {
		return user.id.toString();
	}
	throw new Error("Unable to determine user identifier");
}

export function createSessionManager<TUser extends CustomerSelectType | UserSelectType>(
	config: SessionConfig,
) {
	const {
		cookieName,
		kvSessionPrefix,
		kvUserSessionPrefix,
		renewalThresholdMs,
		sessionDurationMs,
	} = config;

	const sessionKvRecordSchema = v.object({
		expires_at: v.number(),
		id: v.string(),
		user: config.userSchema,
	});

	async function createSession(
		user: TUser,
		kv: KVNamespace,
	): Promise<{ session: Session<TUser>; token: string }> {
		const token = generateSessionToken();
		const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
		const session: Session<TUser> = {
			expiresAt: new Date(Date.now() + sessionDurationMs),
			id: sessionId,
			user,
		};

		const userIdentifier = getUserIdentifier(user);

		await kv.put(
			`${kvSessionPrefix}:${session.id}`,
			JSON.stringify({
				expires_at: Math.floor(session.expiresAt.getTime() / 1000),
				id: session.id,
				user: session.user,
			}),
			{
				expirationTtl: Math.ceil(sessionDurationMs / 1000),
			},
		);
		await kv.put(`${kvUserSessionPrefix}:${userIdentifier}`, sessionId, {
			expirationTtl: Math.ceil(sessionDurationMs / 1000),
		});

		return { session, token };
	}

	async function validateSessionToken(token: string, ctx: Context): Promise<Session<TUser> | null> {
		const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
		const rawSession = await ctx.kv.get(`${kvSessionPrefix}:${sessionId}`);

		if (!rawSession) {
			return null;
		}

		const result = v.parse(sessionKvRecordSchema, JSON.parse(rawSession));

		const session: Session<TUser> = {
			expiresAt: new Date(result.expires_at * 1000),
			id: result.id,
			user: result.user,
		};

		if (
			session === null ||
			session === undefined ||
			session.user === null ||
			session.user === undefined ||
			session.id === null ||
			session.id === undefined
		) {
			return null;
		}

		const expiresAt = new Date(session.expiresAt);

		if (Date.now() >= expiresAt.getTime()) {
			await ctx.kv.delete(`${kvSessionPrefix}:${sessionId}`);
			await ctx.kv.delete(`${kvUserSessionPrefix}:${getUserIdentifier(session.user)}`);
			ctx.log.info("auth.session_expired", { sessionId });
			return null;
		}

		if (Date.now() >= expiresAt.getTime() - renewalThresholdMs) {
			const updatedSession = {
				...session,
				expiresAt: new Date(Date.now() + sessionDurationMs),
			};
			await ctx.kv.put(
				`${kvSessionPrefix}:${session.id}`,
				JSON.stringify({
					expires_at: Math.floor(updatedSession.expiresAt.getTime() / 1000),
					id: updatedSession.id,
					user: updatedSession.user,
				}),
				{
					expirationTtl: Math.ceil(sessionDurationMs / 1000),
				},
			);
			await ctx.kv.put(`${kvUserSessionPrefix}:${getUserIdentifier(session.user)}`, session.id, {
				expirationTtl: Math.ceil(sessionDurationMs / 1000),
			});
			setSessionTokenCookie(ctx.c, token, updatedSession.expiresAt);
			ctx.log.info("auth.session_renewed", { sessionId: session.id });
			return updatedSession;
		}

		return session;
	}

	async function invalidateSession(ctx: Context): Promise<void> {
		if (ctx.session?.id) {
			await ctx.kv.delete(`${kvSessionPrefix}:${ctx.session.id}`);

			const sessionUser = ctx.session.user;
			const userIdentifier =
				"phone" in sessionUser && sessionUser.phone
					? sessionUser.phone.toString()
					: "id" in sessionUser && sessionUser.id
						? sessionUser.id.toString()
						: null;

			if (userIdentifier) {
				await ctx.kv.delete(`${kvUserSessionPrefix}:${userIdentifier}`);
			}

			ctx.log.info("auth.logout", { sessionId: ctx.session.id });
		}
		deleteSessionTokenCookie(ctx);
	}

	function setSessionTokenCookie(c: HonoContextType, token: string, expiresAt: Date): void {
		const cookieDomainOption = optionalCookieDomain(c.env.DOMAIN);

		setCookie(c, cookieName, token, {
			domain: cookieDomainOption,
			expires: expiresAt,
			httpOnly: true,
			path: "/",
			sameSite: "None",
			secure: true,
		});
	}

	function deleteSessionTokenCookie(ctx: Context): void {
		const cookieDomainOption = optionalCookieDomain(ctx.c.env.DOMAIN);

		deleteCookie(ctx.c, cookieName, {
			domain: cookieDomainOption,
			expires: new Date(0),
			httpOnly: true,
			maxAge: 0,
			path: "/",
			sameSite: "None",
			secure: true,
		});
	}

	const auth = async (ctx: Context): Promise<Session<TUser> | null> => {
		const token = getCookie(ctx.c, cookieName);

		if (token === undefined) {
			return null;
		}

		return await validateSessionToken(token, ctx);
	};

	return {
		auth,
		createSession,
		deleteSessionTokenCookie,
		invalidateSession,
		setSessionTokenCookie,
		validateSessionToken,
	};
}

export const createCustomerSessionManager = (config: SessionConfig) =>
	createSessionManager<CustomerSelectType>(config);

export const createUserSessionManager = (config: SessionConfig) =>
	createSessionManager<UserSelectType>(config);
