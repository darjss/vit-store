import { env } from "cloudflare:workers";
import { trpcServer } from "@hono/trpc-server";
import {
	adminRouter,
	createAdminSession,
	createUser,
	getUserFromGoogleId,
	setAdminSessionTokenCookie,
	storeRouter,
} from "@vit/api";
import type { OAuth2Tokens } from "arctic";
import { decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createContext } from "./lib/context";
import { google } from "./lib/oauth";
import { rateLimit } from "./lib/rate-limit";

const app = new Hono<{ Bindings: CloudflareBindings }>();
console.log("cors origin", env.CORS_ORIGIN);
app.use(logger());
const rateLimitMiddleware = rateLimit({
	rateLimiter: () => env.RATE_LIMITER,
	getRateLimitKey: (c) => c.req.header("cf-connecting-ip") ?? "unknown",
});

app.use("/*", rateLimitMiddleware);
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN
			? env.CORS_ORIGIN.split(",")
			: ["http://localhost:5173", "https://admin.vitstore.dev"],
		allowMethods: ["GET", "POST", "OPTIONS"],
		credentials: true,
	}),
);

app.use(
	"/trpc/admin/*",
	trpcServer({
		endpoint: "/trpc/admin",
		router: adminRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
	}),
);

app.use(
	"/trpc/store/*",
	trpcServer({
		endpoint: "/trpc/store",
		router: storeRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
	}),
);

app.get("/admin/login/google", (c) => {
	console.log("google login", env.GOOGLE_CLIENT_ID);
	console.log("google callback url", process.env.GOOGLE_CALLBACK_URL);
	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	console.log("generated state and code verifier", state, codeVerifier);
	const url = google.createAuthorizationURL(state, codeVerifier, [
		"openid",
		"profile",
	]);
	console.log("setting google_oauth_temp cookie", { state, codeVerifier });
	setCookie(c, "google_oauth_temp", JSON.stringify({ state, codeVerifier }), {
		path: "/",
		httpOnly: true,
		secure: true,
		maxAge: 60 * 10,
		sameSite: "none",
	});
	return c.redirect(url);
});

app.get("/admin/login/google/callback", async (c) => {
	try {
		const code = c.req.query("code");
		const state = c.req.query("state");
		console.log("All cookies:", c.req.header("cookie"));

		let storedState: string | undefined;
		let codeVerifier: string | undefined;

		const combined = getCookie(c, "google_oauth_temp");
		if (combined) {
			try {
				const parsed = JSON.parse(combined) as {
					state?: string;
					codeVerifier?: string;
				};
				storedState = parsed.state;
				codeVerifier = parsed.codeVerifier;
			} catch (e) {
				console.error("Failed to parse google_oauth_temp cookie", e);
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
			console.error(
				"code state undefined code:",
				code,
				"state",
				state,
				"storedState",
				storedState,
				"codeVerifier",
				codeVerifier,
			);
			return new Response(null, {
				status: 400,
			});
		}
		if (state !== storedState) {
			console.error(
				"state not matched",
				code,
				state,
				storedState,
				codeVerifier,
			);

			return new Response(null, {
				status: 400,
			});
		}

		let tokens: OAuth2Tokens;
		try {
			tokens = await google.validateAuthorizationCode(code, codeVerifier);
		} catch (e) {
			console.error(e);
			return new Response(null, {
				status: 400,
			});
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

		const claims = decodeIdToken(tokens.idToken()) as {
			sub: string;
			name: string;
		};
		const googleUserId = claims.sub;
		const username = claims.name;
		console.log("googleUserId", googleUserId);
		console.log("username", username);
		const existingUser = await getUserFromGoogleId(googleUserId);
		console.log(existingUser);
		if (existingUser !== null && existingUser.isApproved === true) {
			console.log("existingUser is approved", existingUser);
			const session = await createAdminSession(existingUser, env.vitStoreKV);
			console.log("created session with cookie ", session);
			setAdminSessionTokenCookie(c, session.token, session.session.expiresAt);
			return c.redirect(`${process.env.DASH_URL}/`);
		}

		if (googleUserId === "118271302696111351988") {
			console.log("creating user");
			const user = await createUser(googleUserId, username, true);
			const session = await createAdminSession(user, env.vitStoreKV);

			setAdminSessionTokenCookie(c, session.token, session.session.expiresAt);
			return c.redirect(`${process.env.DASH_URL}/`);
		}

		if (existingUser === null || existingUser.isApproved === false) {
			console.log("redirecting to login");
			return c.redirect(`${process.env.DASH_URL}/login`);
		}

		await createUser(googleUserId, username, false);

		return c.redirect(`${process.env.DASH_URL}/login`);
	} catch (e) {
		console.error(e);
		return c.json({
			error: e,
		});
	}
});

app.post("/upload", async (c) => {
	try {
		const formData = await c.req.formData();
		const image = formData.get("image") as File;
		const key = formData.get("key") as string;
		if (!key) {
			console.error("Key is required");
			return c.json({ message: "Key is required" }, 400);
		}
		if (!image) {
			console.error("Image is required");
			return c.json({ message: "Image is required" }, 400);
		}
		if (!image.type.startsWith("image/")) {
			console.error("Invalid image type");
			return c.json({ message: "Invalid image type" }, 400);
		}
		if (image.size > 10 * 1024 * 1024) {
			console.error("Image size is too large");
			return c.json({ message: "Image size is too large" }, 400);
		}

		await c.env.r2Bucket.put(key, image, {
			httpMetadata: {
				contentType: image.type,
			},
		});
		console.log("Uploaded successfully", key);

		return c.json({
			message: "Uploaded successfully",
			url: `https://pub-b7dba2c2817f4a82971b1c3a86e3dafa.r2.dev/${key}`,
		});
	} catch (e) {
		console.error(e);
		return c.json({ status: "ERROR", message: "Failed to upload image" }, 500);
	}
});
app.get("/", (c) => {
	console.log("OK cors origin", env.CORS_ORIGIN);
	return c.text("OK");
});
app.get("/health-check", (c) => {
	console.log("server running");
	return c.json({
		status: "good",
	});
});

export default app;
