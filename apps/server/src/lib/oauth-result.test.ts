import { describe, expect, test } from "bun:test";
import { parseOAuthCookie, validateGoogleIdTokenClaims } from "./oauth-result";

describe("OAuth protocol validation", () => {
	test("accepts only a strict temporary cookie", () => {
		const valid = parseOAuthCookie(
			JSON.stringify({ state: "state", codeVerifier: "verifier" }),
		);
		expect(valid.status).toBe("ok");

		const extra = parseOAuthCookie(
			JSON.stringify({
				state: "state",
				codeVerifier: "verifier",
				token: "must-not-pass",
			}),
		);
		expect(extra.status).toBe("error");
		expect(parseOAuthCookie("not-json").status).toBe("error");
		expect(parseOAuthCookie(undefined).status).toBe("error");
	});

	test("validates issuer, audience, expiry, and verified email", () => {
		const claims = {
			sub: "google-user",
			iss: "https://accounts.google.com",
			aud: "client-id",
			exp: 200,
			email: "admin@example.com",
			email_verified: true,
			iat: 100,
		};
		expect(validateGoogleIdTokenClaims(claims, "client-id", 100).status).toBe(
			"ok",
		);
		expect(
			validateGoogleIdTokenClaims(
				{ ...claims, aud: "other-client" },
				"client-id",
				100,
			).status,
		).toBe("error");
		expect(validateGoogleIdTokenClaims(claims, "client-id", 200).status).toBe(
			"error",
		);
		expect(
			validateGoogleIdTokenClaims(
				{ ...claims, email_verified: false },
				"client-id",
				100,
			).status,
		).toBe("error");
	});
});
