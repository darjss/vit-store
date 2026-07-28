import { createAdminSession, setAdminSessionTokenCookie } from "@vit/api";
import { userQueries } from "@vit/api/queries";
import { decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import { match } from "dismatch";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { google } from "../lib/oauth";
import {
	classifyOAuthTokenError,
	type OAuthFailure,
	parseOAuthCookie,
	type ValidGoogleIdTokenClaims,
	validateGoogleIdTokenClaims,
} from "../lib/oauth-result";
import type { ServerHonoEnv } from "../lib/logging";

const app: Hono<ServerHonoEnv> = new Hono<ServerHonoEnv>();
const COOKIE_MAX_AGE = 60 * 10;
const OAUTH_TEMP_COOKIE = "google_oauth_temp";
const BOOTSTRAP_ADMIN_GOOGLE_ID = "118271302696111351988";
const APPROVAL_MESSAGE =
	"Таны бүртгэл баталгаажуулалтаар хүлээгдэж байна. Администратораас батламж авна уу.";

const getOAuthCookieOptions = (isSecure: boolean) => ({
	path: "/",
	httpOnly: true,
	secure: isSecure,
	maxAge: COOKIE_MAX_AGE,
	sameSite: isSecure ? ("None" as const) : ("Lax" as const),
});

const oauthFailureResponse = (
	c: Context<ServerHonoEnv>,
	error: OAuthFailure,
) => {
	c.get("log").warn("auth.login_failed", {
		error_tag: error._tag,
		...("retryable" in error ? { retryable: error.retryable } : {}),
	});
	return match(
		error,
		"_tag",
	)<Response>({
		InvalidOAuthRequest: () => new Response(null, { status: 400 }),
		InvalidOAuthState: () => new Response(null, { status: 400 }),
		OAuthGrantRejected: () => new Response(null, { status: 400 }),
		OAuthProviderUnavailable: () =>
			c.json({ error: "Authentication provider unavailable" }, 503),
		AdminApprovalRequired: () =>
			c.redirect(
				`${c.env.DASH_URL}/login?message=${encodeURIComponent(APPROVAL_MESSAGE)}`,
			),
	});
};

const completeGoogleLogin = async (
	c: Context<ServerHonoEnv>,
	claims: ValidGoogleIdTokenClaims,
) => {
	const googleUserId = claims.sub;
	const username = claims.name ?? claims.email ?? "Google User";
	const q = userQueries.admin;
	let user = await q.getUserFromGoogleId(googleUserId);
	if (user && googleUserId === BOOTSTRAP_ADMIN_GOOGLE_ID && !user.isApproved) {
		user = await q.updateUserByGoogleId(googleUserId, {
			isApproved: true,
			username,
		});
	}

	if (!user && googleUserId === BOOTSTRAP_ADMIN_GOOGLE_ID) {
		user = await q.createUser(googleUserId, username, true);
	} else if (!user) {
		await q.createUser(googleUserId, username, false);
	}
	if (!user?.isApproved) {
		return oauthFailureResponse(c, { _tag: "AdminApprovalRequired" });
	}

	const session = await createAdminSession(user, c.env.vitStoreKV);
	setAdminSessionTokenCookie(c, session.token, session.session.expiresAt);
	c.get("log").info("admin.login", { provider: "google" });
	return c.redirect(`${c.env.DASH_URL}/`);
};

app.get("/login/google", (c) => {
	const log = c.get("log");
	log.set({ user_type: "anonymous", operation: "auth.oauth_start" });
	const isSecure = c.req.url.startsWith("https://");
	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	const url = google.createAuthorizationURL(state, codeVerifier, [
		"openid",
		"profile",
		"email",
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
	const log = c.get("log");
	log.set({ user_type: "anonymous", operation: "auth.oauth_callback" });
	const isSecure = c.req.url.startsWith("https://");
	const code = c.req.query("code");
	const state = c.req.query("state");
	if (!code || !state) {
		return oauthFailureResponse(c, { _tag: "InvalidOAuthRequest" });
	}

	const cookie = parseOAuthCookie(getCookie(c, OAUTH_TEMP_COOKIE));
	if (cookie.status === "error") {
		return oauthFailureResponse(c, cookie.error);
	}
	if (state !== cookie.value.state) {
		return oauthFailureResponse(c, { _tag: "InvalidOAuthState" });
	}

	let tokens: Awaited<ReturnType<typeof google.validateAuthorizationCode>>;
	try {
		tokens = await google.validateAuthorizationCode(
			code,
			cookie.value.codeVerifier,
		);
	} catch (error) {
		const failure = classifyOAuthTokenError(error);
		if (failure === undefined) throw error;
		return oauthFailureResponse(c, failure);
	}

	deleteCookie(c, OAUTH_TEMP_COOKIE, {
		path: "/",
		sameSite: isSecure ? "None" : "Lax",
		secure: isSecure,
		httpOnly: true,
		maxAge: 0,
		expires: new Date(0),
	});

	let decodedClaims: unknown;
	try {
		decodedClaims = decodeIdToken(tokens.idToken());
	} catch {
		return oauthFailureResponse(c, { _tag: "InvalidOAuthRequest" });
	}
	const claims = validateGoogleIdTokenClaims(
		decodedClaims,
		c.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
	);
	if (claims.status === "error") {
		return oauthFailureResponse(c, claims.error);
	}

	return completeGoogleLogin(c, claims.value);
});

export default app;
