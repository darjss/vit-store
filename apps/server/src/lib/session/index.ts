import { sha256 } from "@oslojs/crypto/sha2";
import {
	encodeHexLowerCase,
	encodeBase32LowerCaseNoPadding,
} from "@oslojs/encoding";

import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { CustomerSelectType, UserSelectType } from "@/db/schema";
import type { Context } from "../context";
import type { SessionConfig } from "../types";

// Generic Session interface
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

// Generic session manager that works with any user type
export function createSessionManager<
	TUser extends CustomerSelectType | UserSelectType,
>(config: SessionConfig) {
	const {
		kvSessionPrefix,
		kvUserSessionPrefix,
		cookieName,
		domainEnvVar,
		sessionDurationMs,
		renewalThresholdMs,
	} = config;

	// Helper function to get user identifier
	function getUserIdentifier(user: TUser): string {
		// Use phone for customers, id for users, or fallback to a common identifier
		if ("phone" in user && user.phone) {
			return user.phone.toString();
		}
		if ("id" in user && user.id) {
			return user.id.toString();
		}
		// Fallback - this shouldn't happen but provides safety
		throw new Error("Unable to determine user identifier");
	}

	async function createSession(
		user: TUser,
		ctx: Context,
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

		await ctx.kv.put(
			`${kvSessionPrefix}:${session.id}`,
			JSON.stringify({
				id: session.id,
				user: session.user,
				expires_at: Math.floor(session.expiresAt.getTime() / 1000),
			}),
			{
				expirationTtl: Math.floor(session.expiresAt.getTime() / 1000),
			},
		);
		await ctx.kv.put(`${kvUserSessionPrefix}:${userIdentifier}`, sessionId);

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
					expirationTtl: Math.floor(updatedSession.expiresAt.getTime() / 1000),
				},
			);
			return updatedSession;
		}

		return session;
	}

	async function invalidateSession(ctx: Context): Promise<void> {
		if (ctx.session?.id) {
			await ctx.kv.delete(`${kvSessionPrefix}:${ctx.session.id}`);
		}
		deleteSessionTokenCookie(ctx);
	}

	function setSessionTokenCookie(
		ctx: Context,
		token: string,
		expiresAt: Date,
	): void {
		const isProduction = process.env.NODE_ENV === "production";

		setCookie(ctx.c, cookieName, token, {
			httpOnly: true,
			sameSite: isProduction ? "none" : "lax",
			secure: isProduction,
			expires: expiresAt,
			path: "/",
			domain: isProduction ? process.env[domainEnvVar] : undefined,
		});
	}

	function deleteSessionTokenCookie(ctx: Context): void {
		const isProduction = process.env.NODE_ENV === "production";

		deleteCookie(ctx.c, cookieName, {
			httpOnly: true,
			sameSite: isProduction ? "none" : "lax",
			secure: isProduction,
			maxAge: 0,
			path: "/",
			domain: isProduction ? process.env[domainEnvVar] : undefined,
		});
	}

	const auth = async (ctx: Context): Promise<Session<TUser> | null> => {
		const token = getCookie(ctx.c, cookieName);
		console.log(`checking auth with ${cookieName}:`, token);

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

// Pre-configured session managers for convenience
export const createCustomerSessionManager = (config: SessionConfig) =>
	createSessionManager<CustomerSelectType>(config);

export const createUserSessionManager = (config: SessionConfig) =>
	createSessionManager<UserSelectType>(config);
