import { env } from "cloudflare:workers";
import { trpcServer } from "@hono/trpc-server";
import type { OAuth2Tokens } from "arctic";
import { decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createContext } from "./lib/context";
import { google } from "./lib/oauth";
import {
	createAdminSession,
	setAdminSessionTokenCookie,
} from "./lib/session/admin";
import { adminRouter } from "./routers/admin";
import { createUser, getUserFromGoogleId } from "./routers/admin/utils";
import { storeRouter } from "./routers/store";

const app = new Hono<{ Bindings: CloudflareBindings }>();
console.log("cors origin", env.CORS_ORIGIN);
app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN || "",
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
	console.log("google login", process.env.GOOGLE_CLEINT_ID);
	console.log("google callback url", process.env.GOOGLE_CALLBACK_URL);
	const state = generateState();
	const codeVerifier = generateCodeVerifier();
	const url = google.createAuthorizationURL(state, codeVerifier, [
		"openid",
		"profile",
	]);
	setCookie(c, "google_oauth_state", state, {
		path: "/",
		httpOnly: true,
		secure: true,
		maxAge: 60 * 10,
		sameSite: "lax",
	});
	setCookie(c, "google_code_verifier", codeVerifier, {
		path: "/",
		httpOnly: true,
		secure: true,
		maxAge: 60 * 10,
		sameSite: "lax",
	});
	return c.redirect(url);
});

app.get("/admin/login/google/callback", async (c) => {
	try {
		const code = c.req.query("code");
		const state = c.req.query("state");
		const storedState = getCookie(c, "google_oauth_state");
		const codeVerifier = getCookie(c, "google_code_verifier");
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
		const claims = decodeIdToken(tokens.idToken()) as {
			sub: string;
			name: string;
		};
		const googleUserId = claims.sub;
		const username = claims.name;
		console.log("googleUserId", googleUserId);
		console.log("username", username);
		const ctx = await createContext({ context: c });
		const existingUser = await getUserFromGoogleId(googleUserId, ctx);
		console.log(existingUser);
		if (existingUser !== null && existingUser.isApproved === true) {
			console.log("existingUser is approved", existingUser);
			const session = await createAdminSession(existingUser, ctx);
			console.log("created session with cookie ", session);
			setAdminSessionTokenCookie(ctx, session.token, session.session.expiresAt);
			return c.redirect(`${process.env.DASH_URL}/`);
		}

		if (googleUserId === "118271302696111351988") {
			console.log("creating user");
			const user = await createUser(googleUserId, username, true, ctx);
			const session = await createAdminSession(user, ctx);

			setAdminSessionTokenCookie(ctx, session.token, session.session.expiresAt);
			return c.redirect(`${process.env.DASH_URL}/`);
		}

		if (existingUser === null || existingUser.isApproved === false) {
			console.log("redirecting to login");
			return c.redirect(`${process.env.DASH_URL}/login`);
		}

		await createUser(googleUserId, username, false, ctx);

		return c.redirect(`${process.env.DASH_URL}/login`);
	} catch (e) {
		console.error(e);
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
	return c.text("OK");
});

export default app;
