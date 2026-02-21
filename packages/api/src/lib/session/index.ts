import { sha256 } from "@oslojs/crypto/sha2";
import {
	encodeBase32LowerCaseNoPadding,
	encodeHexLowerCase,
} from "@oslojs/encoding";

import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context, CustomerSelectType, UserSelectType } from "../context";
import type { HonoContextType, SessionConfig } from "../types";

export type { CustomerSelectType, UserSelectType } from "../context";

export interface Session<TUser = CustomerSelectType | UserSelectType> {
	id: string;
	user: TUser;
	expiresAt: Date;
}

export function generateSessionToken(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

export function createSessionManager<
	TUser extends CustomerSelectType | UserSelectType,
>(config: SessionConfig) {
	const {
		kvSessionPrefix,
		kvUserSessionPrefix,
		cookieName,
		sessionDurationMs,
		renewalThresholdMs,
	} = config;

	function getUserIdentifier(user: TUser): string {
		if ("phone" in user && user.phone) {
			return user.phone.toString();
		}
		if ("id" in user && user.id) {
			return user.id.toString();
		}
		throw new Error("Unable to determine user identifier");
	}

	async function createSession(
		user: TUser,
		kv: KVNamespace,
	): Promise<{ session: Session<TUser>; token: string }> {
		const token = generateSessionToken();
		const sessionId = encodeHexLowerCase(
			sha256(new TextEncoder().encode(token)),
		);
		const session: Session<TUser> = {
			id: sessionId,
			user,
			expiresAt: new Date(Date.now() + sessionDurationMs),
		};

		const userIdentifier = getUserIdentifier(user);

		await kv.put(
			`${kvSessionPrefix}:${session.id}`,
			JSON.stringify({
				id: session.id,
				user: session.user,
				expires_at: Math.floor(session.expiresAt.getTime() / 1000),
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

	async function validateSessionToken(
		token: string,
		ctx: Context,
	): Promise<Session<TUser> | null> {
		const sessionId = encodeHexLowerCase(
			sha256(new TextEncoder().encode(token)),
		);
		const rawSession = await ctx.kv.get(`${kvSessionPrefix}:${sessionId}`);

		if (!rawSession) {
			return null;
		}

		const result = JSON.parse(rawSession) as {
			id: string;
			user: TUser;
			expires_at: number;
		};

		const session: Session<TUser> = {
			id: result.id,
			user: result.user,
			expiresAt: new Date(result.expires_at * 1000),
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
			await ctx.kv.delete(
				`${kvUserSessionPrefix}:${getUserIdentifier(session.user)}`,
			);
			ctx.log.auth.sessionExpired({ sessionId });
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
					id: updatedSession.id,
					user: updatedSession.user,
					expires_at: Math.floor(updatedSession.expiresAt.getTime() / 1000),
				}),
				{
					expirationTtl: Math.ceil(sessionDurationMs / 1000),
				},
			);
			await ctx.kv.put(
				`${kvUserSessionPrefix}:${getUserIdentifier(session.user)}`,
				session.id,
				{ expirationTtl: Math.ceil(sessionDurationMs / 1000) },
			);
			setSessionTokenCookie(ctx.c, token, updatedSession.expiresAt);
			ctx.log.auth.sessionRenewed({ sessionId: session.id });
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

			ctx.log.auth.logout({ sessionId: ctx.session.id });
		}
		deleteSessionTokenCookie(ctx);
	}

	function setSessionTokenCookie(
		c: HonoContextType,
		token: string,
		expiresAt: Date,
	): void {
		const cookieDomain = c.env.DOMAIN;
		const cookieDomainOption =
			typeof cookieDomain === "string" && cookieDomain.length > 0
				? cookieDomain
				: undefined;

		setCookie(c, cookieName, token, {
			httpOnly: true,
			sameSite: "None",
			secure: true,
			expires: expiresAt,
			path: "/",
			domain: cookieDomainOption,
		});
	}

	function deleteSessionTokenCookie(ctx: Context): void {
		const cookieDomain = ctx.c.env.DOMAIN;
		const cookieDomainOption =
			typeof cookieDomain === "string" && cookieDomain.length > 0
				? cookieDomain
				: undefined;

		deleteCookie(ctx.c, cookieName, {
			httpOnly: true,
			sameSite: "None",
			secure: true,
			expires: new Date(0),
			maxAge: 0,
			path: "/",
			domain: cookieDomainOption,
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
		createSession,
		validateSessionToken,
		invalidateSession,
		setSessionTokenCookie,
		deleteSessionTokenCookie,
		auth,
	};
}

export const createCustomerSessionManager = (config: SessionConfig) =>
	createSessionManager<CustomerSelectType>(config);

export const createUserSessionManager = (config: SessionConfig) =>
	createSessionManager<UserSelectType>(config);
