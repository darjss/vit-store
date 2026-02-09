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

type OAuthCookieData = {
	state?: string;
	codeVerifier?: string;
};

type GoogleIdTokenClaims = {
	sub: string;
	name: string;
};

app.get("/login/google", (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "anonymous" });
	const log = createLogger(logContext);
	setLogger(c, log);

	log.auth.loginSuccess({ adminEmail: "google_oauth_start" });

	const state = generateState();
	const codeVerifier = generateCodeVerifier();

	const url = google.createAuthorizationURL(state, codeVerifier, [
		"openid",
		"profile",
	]);

	setCookie(c, "google_oauth_temp", JSON.stringify({ state, codeVerifier }), {
		path: "/",
		httpOnly: true,
		secure: true,
		maxAge: COOKIE_MAX_AGE,
		sameSite: "none",
	});

	log.info("auth.oauth_redirect", { provider: "google" });

	return c.redirect(url);
});

app.get("/login/google/callback", async (c) => {
	const logContext = createRequestContext(c.req.raw, { userType: "anonymous" });
	const log = createLogger(logContext);
	setLogger(c, log);

	try {
		const code = c.req.query("code");
		const state = c.req.query("state");

		let storedState: string | undefined;
		let codeVerifier: string | undefined;

		const combined = getCookie(c, "google_oauth_temp");
		if (combined) {
			try {
				const parsed = JSON.parse(combined) as OAuthCookieData;
				storedState = parsed.state;
				codeVerifier = parsed.codeVerifier;
			} catch (e) {
				log.error("auth.oauth_cookie_parse_failed", e);
			}
		}

		if (!storedState || !codeVerifier) {
			storedState = getCookie(c, "google_oauth_state");
			codeVerifier = getCookie(c, "google_code_verifier");
		}

		if (
			code === null ||
			state === null ||
			storedState === null ||
			codeVerifier === null ||
			code === undefined ||
			state === undefined ||
			storedState === undefined ||
			codeVerifier === undefined
		) {
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

		deleteCookie(c, "google_oauth_temp", {
			path: "/",
			sameSite: "none",
			secure: true,
		});
		deleteCookie(c, "google_oauth_state", {
			path: "/",
			sameSite: "none",
			secure: true,
			domain: ".vitstore.dev",
		});
		deleteCookie(c, "google_code_verifier", {
			path: "/",
			sameSite: "none",
			secure: true,
			domain: ".vitstore.dev",
		});

		const claims = decodeIdToken(tokens.idToken()) as GoogleIdTokenClaims;
		const googleUserId = claims.sub;
		const username = claims.name;

		const q = userQueries.admin;
		const existingUser = await q.getUserFromGoogleId(googleUserId);

		if (existingUser !== null && existingUser.isApproved === true) {
			const session = await createAdminSession(existingUser, c.env.vitStoreKV);
			setAdminSessionTokenCookie(c, session.token, session.session.expiresAt);

			log.admin.login({
				adminId: googleUserId,
				adminEmail: username,
			});

			return c.redirect(`${process.env.DASH_URL}/`);
		}

		if (googleUserId === "118271302696111351988") {
			const user = await q.createUser(googleUserId, username, true);
			const session = await createAdminSession(user, c.env.vitStoreKV);

			setAdminSessionTokenCookie(c, session.token, session.session.expiresAt);

			log.admin.login({
				adminId: googleUserId,
				adminEmail: username,
			});

			return c.redirect(`${process.env.DASH_URL}/`);
		}

		await q.createUser(googleUserId, username, false);

		if (existingUser === null || existingUser.isApproved === false) {
			log.auth.loginFailed({
				adminId: googleUserId,
				failureReason: "not_approved",
			});

			return c.redirect(
				`${process.env.DASH_URL}/login?message=` +
					encodeURIComponent(
						"Таны бүртгэл баталгаажуулалтаар хүлээгдэж байна. Администратораас батламж авна уу.",
					),
			);
		}

		return c.redirect(`${process.env.DASH_URL}/login`);
	} catch (e) {
		log.error("auth.oauth_callback_error", e);
		return c.json({ error: e });
	}
});

export default app;
