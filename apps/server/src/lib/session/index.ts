import { sha256 } from "@oslojs/crypto/sha2";
import {
	encodeHexLowerCase,
	encodeBase32LowerCaseNoPadding,
} from "@oslojs/encoding";

import type { Session } from "../types";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { CustomerSelectType } from "@/db/schema";
import type { Context } from "../context";

export interface SessionConfig {
	kvSessionPrefix: string; // e.g., "store_session" or "admin_session"
	kvUserSessionPrefix: string; // e.g., "store_user_sessions" or "admin_user_sessions"
	cookieName: string; // e.g., "store_session" or "admin_session"
	domainEnvVar: string; // e.g., "STORE_DOMAIN" or "ADMIN_DOMAIN"
	sessionDurationMs: number; // e.g., 7 days or 1 day
	renewalThresholdMs: number; // e.g., 30 minutes
}

export function generateSessionToken(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

export function createSessionManager(config: SessionConfig) {
	const {
		kvSessionPrefix,
		kvUserSessionPrefix,
		cookieName,
		domainEnvVar,
		sessionDurationMs,
		renewalThresholdMs,
	} = config;

	async function createSession(
		user: CustomerSelectType,
		ctx: Context,
	): Promise<{ session: Session; token: string }> {
		const token = generateSessionToken();
		const sessionId = encodeHexLowerCase(
			sha256(new TextEncoder().encode(token)),
		);
		const session: Session = {
			id: sessionId,
			user,
			expiresAt: new Date(Date.now() + sessionDurationMs),
		};

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
		await ctx.kv.put(`${kvUserSessionPrefix}:${user.phone}`, sessionId);

		return { session, token };
	}

	async function validateSessionToken(
		token: string,
		ctx: Context,
	): Promise<Session | null> {
		const sessionId = encodeHexLowerCase(
			sha256(new TextEncoder().encode(token)),
		);
		const rawSession = await ctx.kv.get(`${kvSessionPrefix}:${sessionId}`);

		if (!rawSession) {
			return null;
		}

		const result = JSON.parse(rawSession) as {
			id: string;
			user: CustomerSelectType;
			expires_at: number;
		};

		const session: Session = {
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
		await ctx.kv.delete(`${kvSessionPrefix}:${ctx.session?.id}`);
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

	const auth = async (ctx: Context): Promise<Session | null> => {
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
