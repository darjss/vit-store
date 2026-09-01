import { createAdminSession, setAdminSessionTokenCookie } from "@vit/api";
import { userQueries } from "@vit/api/queries";
import type { ServerHonoEnv } from "../lib/logging";
import {
	googleIdTokenClaimsSchema,
	oauthCookieDataSchema,
	type GoogleIdTokenClaims,
} from "@vit/shared";
import type { OAuth2Tokens } from "arctic";
import { decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import * as v from "valibot";
import { google } from "../lib/oauth";
const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();
type AuthContext = Context<ServerHonoEnv>;
const COOKIE_MAX_AGE = 60 * 10;
const OAUTH_TEMP_COOKIE = "google_oauth_temp";
const BOOTSTRAP_ADMIN_GOOGLE_ID = "118271302696111351988";
function getOAuthCookieOptions(isSecure: boolean) {
	return {
		httpOnly: true,
		maxAge: COOKIE_MAX_AGE,
		path: "/",
		sameSite: isSecure ? ("None" as const) : ("Lax" as const),
		secure: isSecure,
	};
}
function isValidGoogleIdTokenAudience(
	audience: string | Array<string> | undefined,
	clientId: string,
): boolean {
	if (!clientId || audience === undefined) {
		return false;
	}
	return Array.isArray(audience) ? audience.includes(clientId) : audience === clientId;
}
function isValidGoogleIdTokenClaims(claims: GoogleIdTokenClaims, clientId: string): boolean {
	const validIssuer =
		claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
	if (!validIssuer) {
		return false;
	}
	if (!isValidGoogleIdTokenAudience(claims.aud, clientId)) {
		return false;
	}
	if (Math.floor(Date.now() / 1000) >= claims.exp) {
		return false;
	}
	if (claims.email !== undefined && claims.email_verified !== true) {
		return false;
	}
	return true;
}

function parseOAuthTempCookie(combined: string | undefined) {
	if (!combined) {
		return null;
	}
	try {
		return v.parse(oauthCookieDataSchema, JSON.parse(combined));
	} catch {
		return null;
	}
}

async function loginApprovedGoogleUser(
	c: AuthContext,
	log: AuthContext["var"]["log"],
	claims: GoogleIdTokenClaims,
) {
	const googleUserId = claims.sub;
	const username = claims.name ?? claims.email ?? "Google User";
	const adminEmail = claims.email ?? "unknown";
	const q = userQueries.admin;
	let user = await q.getUserFromGoogleId(googleUserId);
	if (user && googleUserId === BOOTSTRAP_ADMIN_GOOGLE_ID && !user.isApproved) {
		user = await q.updateUserByGoogleId(googleUserId, {
			isApproved: true,
			username,
		});
	}
	if (user?.isApproved) {
		const session = await createAdminSession(user, c.env.vitStoreKV);
		setAdminSessionTokenCookie(c, session.token, session.session.expiresAt);
		log.info("admin.login", { adminEmail, adminId: googleUserId });
		return c.redirect(`${c.env.DASH_URL}/`);
	}
	if (!user && googleUserId === BOOTSTRAP_ADMIN_GOOGLE_ID) {
		const bootstrapUser = await q.createUser(googleUserId, username, true);
		const session = await createAdminSession(bootstrapUser, c.env.vitStoreKV);
		setAdminSessionTokenCookie(c, session.token, session.session.expiresAt);
		log.info("admin.login", { adminEmail, adminId: googleUserId });
		return c.redirect(`${c.env.DASH_URL}/`);
	}
	if (!user) {
		await q.createUser(googleUserId, username, false);
	}
	log.warn("auth.login_failed", { adminId: googleUserId, failureReason: "not_approved" });
	return c.redirect(
		`${c.env.DASH_URL}/login?message=` +
			encodeURIComponent(
				"Таны бүртгэл баталгаажуулалтаар хүлээгдэж байна. Администратораас батламж авна уу.",
			),
	);
}

app.get("/login/google", (c) => {
	const log = c.get("log");
	log.set({ operation: "auth.oauth_start", user_type: "anonymous" });
	const isSecure = c.req.url.startsWith("https://");
	log.info("auth.oauth_start", { provider: "google" });
	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	const url = google.createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);
	setCookie(
		c,
		OAUTH_TEMP_COOKIE,
		JSON.stringify({ codeVerifier, state }),
		getOAuthCookieOptions(isSecure),
	);
	log.info("auth.oauth_redirect", { provider: "google" });
	return c.redirect(url);
});
app.get("/login/google/callback", async (c) => {
	const log = c.get("log");
	log.set({ operation: "auth.oauth_callback", user_type: "anonymous" });
	const isSecure = c.req.url.startsWith("https://");
	try {
		const code = c.req.query("code");
		const state = c.req.query("state");
		const oauthCookie = parseOAuthTempCookie(getCookie(c, OAUTH_TEMP_COOKIE));
		if (!oauthCookie) {
			log.warn("auth.login_failed", { failureReason: "missing_oauth_params" });
			return new Response(null, { status: 400 });
		}
		if (!code || !state) {
			log.warn("auth.login_failed", { failureReason: "missing_oauth_params" });
			return new Response(null, { status: 400 });
		}
		if (state !== oauthCookie.state) {
			log.warn("auth.login_failed", { failureReason: "state_mismatch" });
			return new Response(null, { status: 400 });
		}
		let tokens: OAuth2Tokens;
		try {
			tokens = await google.validateAuthorizationCode(code, oauthCookie.codeVerifier);
		} catch (error) {
			log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "auth.oauth_token_validation_failed",
			});
			return new Response(null, { status: 400 });
		}
		deleteCookie(c, OAUTH_TEMP_COOKIE, {
			expires: new Date(0),
			httpOnly: true,
			maxAge: 0,
			path: "/",
			sameSite: isSecure ? "None" : "Lax",
			secure: isSecure,
		});
		const claimsResult = v.safeParse(googleIdTokenClaimsSchema, decodeIdToken(tokens.idToken()));
		const googleClientId = c.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
		if (!claimsResult.success || !isValidGoogleIdTokenClaims(claimsResult.output, googleClientId)) {
			log.warn("auth.login_failed", { failureReason: "invalid_id_token_claims" });
			return new Response(null, { status: 400 });
		}
		return loginApprovedGoogleUser(c, log, claimsResult.output);
	} catch (error) {
		log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "auth.oauth_callback_error",
		});
		return c.json({ error: "Authentication failed" }, 500);
	}
});
export default app;
