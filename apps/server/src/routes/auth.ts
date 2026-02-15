import { createAdminSession, setAdminSessionTokenCookie } from "@vit/api";
import { userQueries } from "@vit/api/queries";
import { createLogger, createRequestContext, setLogger } from "@vit/logger";
import type { OAuth2Tokens } from "arctic";
import { decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { google } from "../lib/oauth";

const app = new Hono<{ Bindings: Env }>();

const COOKIE_MAX_AGE = 60 * 10;
const OAUTH_TEMP_COOKIE = "google_oauth_temp";
const BOOTSTRAP_ADMIN_GOOGLE_ID = "118271302696111351988";

type OAuthCookieData = {
	state?: string;
	codeVerifier?: string;
};

type GoogleIdTokenClaims = {
	sub: string;
	name?: string;
	email?: string;
	email_verified?: boolean;
	iss?: string;
	aud?: string | string[];
	exp?: number;
};

function getOAuthCookieOptions(isSecure: boolean): {
	path: string;
	httpOnly: boolean;
	secure: boolean;
	maxAge: number;
	sameSite: "None" | "Lax";
} {
	return {
		path: "/",
		httpOnly: true,
		secure: isSecure,
		maxAge: COOKIE_MAX_AGE,
		sameSite: isSecure ? "None" : "Lax",
	};
}

function isValidGoogleIdTokenAudience(
	audience: string | string[] | undefined,
	clientId: string,
): boolean {
	if (!clientId) {
		return false;
	}

	if (typeof audience === "string") {
		return audience === clientId;
	}

	if (Array.isArray(audience)) {
		return audience.includes(clientId);
	}

	return false;
}

function isValidGoogleIdTokenClaims(
	claims: GoogleIdTokenClaims,
	clientId: string,
): boolean {
	const validIssuer =
		claims.iss === "https://accounts.google.com" ||
		claims.iss === "accounts.google.com";

	if (!validIssuer) {
		return false;
	}

	if (!isValidGoogleIdTokenAudience(claims.aud, clientId)) {
		return false;
	}

	if (typeof claims.exp !== "number") {
		return false;
	}

	if (Math.floor(Date.now() / 1000) >= claims.exp) {
		return false;
	}

	if (claims.email_verified !== true) {
		return false;
	}

	if (typeof claims.sub !== "string" || claims.sub.length === 0) {
		return false;
	}

	return true;
}

app.get("/login/google", (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "anonymous" });
	const log = createLogger(logContext);
	setLogger(c, log);
	const isSecure = c.req.url.startsWith("https://");

	log.info("auth.oauth_start", { provider: "google" });

	const state = generateState();
	const codeVerifier = generateCodeVerifier();

	const url = google.createAuthorizationURL(state, codeVerifier, [
		"openid",
		"profile",
	]);

	setCookie(
		c,
		OAUTH_TEMP_COOKIE,
		JSON.stringify({ state, codeVerifier }),
		getOAuthCookieOptions(isSecure),
	);

	log.info("auth.oauth_redirect", { provider: "google" });

	return c.redirect(url);
});

app.get("/login/google/callback", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "anonymous" });
	const log = createLogger(logContext);
	setLogger(c, log);
	const isSecure = c.req.url.startsWith("https://");

	try {
		const code = c.req.query("code");
		const state = c.req.query("state");

		const combined = getCookie(c, OAUTH_TEMP_COOKIE);
		if (!combined) {
			log.auth.loginFailed({
				failureReason: "missing_oauth_params",
			});
			return new Response(null, { status: 400 });
		}

		let storedState: string | undefined;
		let codeVerifier: string | undefined;

		try {
			const parsed = JSON.parse(combined) as OAuthCookieData;
			storedState = parsed.state;
			codeVerifier = parsed.codeVerifier;
		} catch (error) {
			log.error("auth.oauth_cookie_parse_failed", error);
			return new Response(null, { status: 400 });
		}

		if (!code || !state || !storedState || !codeVerifier) {
			log.auth.loginFailed({
				failureReason: "missing_oauth_params",
			});
			return new Response(null, { status: 400 });
		}

		if (state !== storedState) {
			log.auth.loginFailed({
				failureReason: "state_mismatch",
			});
			return new Response(null, { status: 400 });
		}

		let tokens: OAuth2Tokens;
		try {
			tokens = await google.validateAuthorizationCode(code, codeVerifier);
		} catch (e) {
			log.error("auth.oauth_token_validation_failed", e);
			return new Response(null, { status: 400 });
		}

		deleteCookie(c, OAUTH_TEMP_COOKIE, {
			path: "/",
			sameSite: isSecure ? "None" : "Lax",
			secure: isSecure,
			httpOnly: true,
			maxAge: 0,
			expires: new Date(0),
		});

		const claims = decodeIdToken(tokens.idToken()) as GoogleIdTokenClaims;
		if (!isValidGoogleIdTokenClaims(claims, c.env.GOOGLE_CLIENT_ID)) {
			log.auth.loginFailed({
				failureReason: "invalid_id_token_claims",
			});
			return new Response(null, { status: 400 });
		}

		const googleUserId = claims.sub;
		const username = claims.name ?? claims.email ?? "Google User";
		const adminEmail = claims.email ?? "unknown";
		const q = userQueries.admin;

		let user = await q.getUserFromGoogleId(googleUserId);

		if (
			user &&
			googleUserId === BOOTSTRAP_ADMIN_GOOGLE_ID &&
			!user.isApproved
		) {
			user = await q.updateUserByGoogleId(googleUserId, {
				isApproved: true,
				username,
			});
		}

		if (user?.isApproved) {
			const session = await createAdminSession(user, c.env.vitStoreKV);
			setAdminSessionTokenCookie(c, session.token, session.session.expiresAt);

			log.admin.login({
				adminId: googleUserId,
				adminEmail,
			});

			return c.redirect(`${c.env.DASH_URL}/`);
		}

		if (!user && googleUserId === BOOTSTRAP_ADMIN_GOOGLE_ID) {
			const bootstrapUser = await q.createUser(googleUserId, username, true);
			const session = await createAdminSession(bootstrapUser, c.env.vitStoreKV);
			setAdminSessionTokenCookie(c, session.token, session.session.expiresAt);

			log.admin.login({
				adminId: googleUserId,
				adminEmail,
			});

			return c.redirect(`${c.env.DASH_URL}/`);
		}

		if (!user) {
			await q.createUser(googleUserId, username, false);
		}

		log.auth.loginFailed({
			adminId: googleUserId,
			failureReason: "not_approved",
		});

		return c.redirect(
			`${c.env.DASH_URL}/login?message=` +
				encodeURIComponent(
					"Таны бүртгэл баталгаажуулалтаар хүлээгдэж байна. Администратораас батламж авна уу.",
				),
		);
	} catch (e) {
		log.error("auth.oauth_callback_error", e);
		return c.json({ error: "Authentication failed" }, 500);
	}
});

export default app;
