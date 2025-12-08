import { env } from "cloudflare:workers";
import { trpcServer } from "@hono/trpc-server";
import {
	adminRouter,
	createAdminSession,
	setAdminSessionTokenCookie,
	storeRouter,
} from "@vit/api";
import { createDb } from "@vit/api/db";
import {
	type GenericWebhookPayload,
	messenger,
	messengerWebhookHandler,
} from "@vit/api/integrations";
import { sendTransferNotification } from "@vit/api/lib/integrations/messenger/messages";
import { createQueries } from "@vit/api/queries";
import type { OAuth2Tokens } from "arctic";
import { decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { nanoid } from "nanoid";
import { createContext } from "./lib/context";
import { google } from "./lib/oauth";
import { rateLimit } from "./lib/rate-limit";

type AppType = Hono<{
	Bindings: Env;
}>;
const app: AppType = new Hono<{
	Bindings: Env;
}>();

app.use(logger());
app.use("/*", (c, next) => {
	const rateLimitMiddleware = rateLimit({
		rateLimiter: () => c.env.RATE_LIMITER,
		getRateLimitKey: (c) => c.req.header("cf-connecting-ip") ?? "unknown",
	});
	return rateLimitMiddleware(c, next);
});

app.use("/*", (c, next) => {
	const corsMiddleware = cors({
		origin: c.env.CORS_ORIGIN
			? c.env.CORS_ORIGIN.split(",")
			: ["http://localhost:5173", "https://admin.vitstore.dev"],
		allowMethods: ["GET", "POST", "OPTIONS"],
		credentials: true,
	});
	return corsMiddleware(c, next);
});

app.use(
	"/trpc/admin/*",
	trpcServer({
		endpoint: "/trpc/admin",
		router: adminRouter,
		createContext: (_opts, context) => {
			return createContext({ context });
		},
		onError({ path, error }) {
			console.error("❌ tRPC Admin Error:", {
				path,
				code: error.code,
				message: error.message,
			});
			if (error.cause) {
				console.error("Error cause:", error.cause);
			}
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
		onError({ path, error }) {
			console.error("❌ tRPC Store Error:", {
				path,
				code: error.code,
				message: error.message,
			});
			if (error.cause) {
				console.error("Error cause:", error.cause);
			}
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
		const db = createDb(c.env.DB);
		const q = createQueries(db).users.admin;
		const existingUser = await q.getUserFromGoogleId(googleUserId);
		console.log(existingUser);
		if (existingUser !== null && existingUser.isApproved === true) {
			console.log("existingUser is approved", existingUser);
			const session = await createAdminSession(existingUser, c.env.vitStoreKV);
			console.log("created session with cookie ", session);
			setAdminSessionTokenCookie(c, session.token, session.session.expiresAt);
			return c.redirect(`${process.env.DASH_URL}/`);
		}

		if (googleUserId === "118271302696111351988") {
			console.log("creating user");
			const user = await q.createUser(googleUserId, username, true);
			const session = await createAdminSession(user, c.env.vitStoreKV);

			setAdminSessionTokenCookie(c, session.token, session.session.expiresAt);
			return c.redirect(`${process.env.DASH_URL}/`);
		}
		await q.createUser(googleUserId, username, false);

		if (existingUser === null || existingUser.isApproved === false) {
			console.log("redirecting to login");
			return c.redirect(`${process.env.DASH_URL}/login`);
		}

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
		const image = formData.get("image") as unknown as File;
		const productName = formData.get("productName") as string | null;
		const isPrimary = formData.get("isPrimary") === "true";

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

		const generatedId = nanoid();

		// Sanitize productName if provided
		let keyPrefix = "";
		if (productName) {
			const sanitizedProductName = productName
				.toLowerCase()
				.replace(/\s+/g, "-")
				.replace(/[^a-z0-9-]/g, "");
			keyPrefix = `products/${sanitizedProductName}/`;
		}

		const carouselKey = `${keyPrefix}${generatedId}.webp`;
		const thumbnailKey = `${keyPrefix}${generatedId}-thumbnail.webp`;

		// Get image stream for Cloudflare Images API
		const imageStream = image.stream();

		// Transform image for carousel (800x600, WebP)
		const carouselImageResult = c.env.images
			.input(imageStream)
			.transform({
				width: 800,
				height: 600,
				fit: "contain",
			})
			.output({ format: "image/webp" });

		const carouselImage = await carouselImageResult;

		// Convert ImageTransformationResult to Response, then to ArrayBuffer
		const carouselResponse = carouselImage.response();
		const carouselArrayBuffer = await carouselResponse.arrayBuffer();

		// Upload carousel version to R2
		await c.env.r2Bucket.put(carouselKey, carouselArrayBuffer, {
			httpMetadata: {
				contentType: "image/webp",
			},
		});

		const carouselUrl = `https://cdn.darjs.dev/${carouselKey}`;

		let thumbnailUrl: string | undefined;

		// If isPrimary, also create thumbnail version
		if (isPrimary) {
			// Get image stream again for thumbnail transformation
			const thumbnailImageStream = image.stream();

			const thumbnailImageResult = c.env.images
				.input(thumbnailImageStream)
				.transform({
					width: 400,
					height: 300,
					fit: "contain",
				})
				.output({ format: "image/webp" });

			const thumbnailImage = await thumbnailImageResult;

			// Convert ImageTransformationResult to Response, then to ArrayBuffer
			const thumbnailResponse = thumbnailImage.response();
			const thumbnailArrayBuffer = await thumbnailResponse.arrayBuffer();

			// Upload thumbnail version to R2
			await c.env.r2Bucket.put(thumbnailKey, thumbnailArrayBuffer, {
				httpMetadata: {
					contentType: "image/webp",
				},
			});

			thumbnailUrl = `https://pub-b7dba2c2817f4a82971b1c3a86e3dafa.r2.dev/${thumbnailKey}`;
		}

		console.log("Uploaded successfully", carouselKey);

		const response: {
			message: string;
			url: string;
			thumbnailUrl?: string;
			key: string;
		} = {
			message: "Uploaded successfully",
			url: carouselUrl,
			key: carouselKey,
		};

		if (thumbnailUrl) {
			response.thumbnailUrl = thumbnailUrl;
		}

		return c.json(response);
	} catch (e) {
		console.error(e);
		return c.json({ status: "ERROR", message: "Failed to upload image" }, 500);
	}
});
app.post("/upload/brands", async (c) => {
	try {
		const formData = await c.req.formData();
		const image = formData.get("image") as unknown as File;
		const brandName = formData.get("brandName") as string;
		const isSvg = image.type === "image/svg+xml";

		// Slugify brand name
		const sanitizedBrandName = brandName
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/[^a-z0-9-]/g, "");

		if (isSvg) {
			// For SVG files, save directly without transformation
			const svgArrayBuffer = await image.arrayBuffer();
			await c.env.r2Bucket.put(
				`brands/${sanitizedBrandName}.svg`,
				svgArrayBuffer,
				{
					httpMetadata: {
						contentType: "image/svg+xml",
					},
				},
			);
			return c.json({
				url: `https://cdn.darjs.dev/brands/${sanitizedBrandName}.svg`,
				message: "Brand image uploaded successfully",
			});
		}

		// For non-SVG files, apply transformation
		const imageStream = image.stream();
		const imageResult = c.env.images
			.input(imageStream)
			.transform({
				width: 800,
				height: 800,
				fit: "contain",
			})
			.output({ format: "image/webp" });
		const brandImage = await imageResult;
		const brandImageResponse = brandImage.response();
		const brandImageArrayBuffer = await brandImageResponse.arrayBuffer();
		await c.env.r2Bucket.put(
			`brands/${sanitizedBrandName}.webp`,
			brandImageArrayBuffer,
			{
				httpMetadata: {
					contentType: "image/webp",
				},
			},
		);
		return c.json({
			url: `https://cdn.darjs.dev/brands/${sanitizedBrandName}.webp`,
			message: "Brand image uploaded successfully",
		});
	} catch (e) {
		console.error(e);
		return c.json(
			{ status: "ERROR", message: "Failed to upload brand image" },
			500,
		);
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

app.post("/messenger/webhook", async (c) => {
	const payload = (await c.req.json()) as GenericWebhookPayload;
	console.log("payload", payload);
	const db = createDb(c.env.DB);
	await messengerWebhookHandler(payload, db);
	return c.text("OK", 200);
});

app.get("/messenger/webhook", async (c) => {
	const mode = c.req.query("hub.mode");
	const verifyToken = c.req.query("hub.verify_token");
	const challenge = c.req.query("hub.challenge");
	console.log("verifyToken", verifyToken, "env", env.MESSENGER_VERIFY_TOKEN);
	if (mode && verifyToken && challenge) {
		if (mode === "subscribe" && verifyToken === env.MESSENGER_VERIFY_TOKEN) {
			return c.text(challenge, 200);
		}
		return c.text("Invalid verify token", 403);
	}
	return c.text("Invalid request", 400);
});

app.get("/messenger/test", async (c) => {
	console.log("sending message", process.env.MESSENGER_ACCESS_TOKEN);
	const result = await messenger.send.message({
		messaging_type: "RESPONSE",
		recipient: { id: "25172502442390308" },
		message: { text: "Hello from Vit Store Messenger SDK!" },
	});
	return c.json(result);
});

app.get("/messenger/test/transfer", async (c) => {
	console.log("sending message", env.MESSENGER_ACCESS_TOKEN);
	await sendTransferNotification("1234567890", 10000);
	return c.json({ message: "Message sent" });
});
export default app;
