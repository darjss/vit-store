import { Result, type Result as BetterResult } from "better-result";
import {
	ArcticFetchError,
	OAuth2RequestError,
	UnexpectedErrorResponseBodyError,
	UnexpectedResponseError,
} from "arctic";
import * as v from "valibot";

const oauthFailureSchema = v.variant("_tag", [
	v.strictObject({ _tag: v.literal("InvalidOAuthRequest") }),
	v.strictObject({ _tag: v.literal("InvalidOAuthState") }),
	v.strictObject({ _tag: v.literal("OAuthGrantRejected") }),
	v.strictObject({
		_tag: v.literal("OAuthProviderUnavailable"),
		retryable: v.literal(true),
	}),
	v.strictObject({ _tag: v.literal("AdminApprovalRequired") }),
]);

export type OAuthFailure = v.InferOutput<typeof oauthFailureSchema>;

const oauthCookieSchema = v.strictObject({
	state: v.pipe(v.string(), v.minLength(1)),
	codeVerifier: v.pipe(v.string(), v.minLength(1)),
});

export type OAuthCookie = v.InferOutput<typeof oauthCookieSchema>;

const googleIdTokenClaimsSchema = v.object({
	sub: v.pipe(v.string(), v.minLength(1)),
	name: v.optional(v.string()),
	email: v.optional(v.pipe(v.string(), v.email())),
	email_verified: v.optional(v.boolean()),
	iss: v.picklist(["https://accounts.google.com", "accounts.google.com"]),
	aud: v.union([v.string(), v.array(v.string())]),
	exp: v.pipe(v.number(), v.integer()),
});

export type ValidGoogleIdTokenClaims = v.InferOutput<
	typeof googleIdTokenClaimsSchema
>;

type InvalidOAuthRequest = Extract<
	OAuthFailure,
	{ _tag: "InvalidOAuthRequest" }
>;

export const parseOAuthCookie = (
	value: string | undefined,
): BetterResult<OAuthCookie, InvalidOAuthRequest> => {
	if (value === undefined) {
		return Result.err({ _tag: "InvalidOAuthRequest" });
	}
	let decoded: unknown;
	try {
		decoded = JSON.parse(value);
	} catch {
		return Result.err({ _tag: "InvalidOAuthRequest" });
	}
	const parsed = v.safeParse(oauthCookieSchema, decoded);
	return parsed.success
		? Result.ok(parsed.output)
		: Result.err({ _tag: "InvalidOAuthRequest" });
};

export const validateGoogleIdTokenClaims = (
	claims: unknown,
	clientId: string,
	nowSeconds = Math.floor(Date.now() / 1000),
): BetterResult<ValidGoogleIdTokenClaims, InvalidOAuthRequest> => {
	if (clientId.length === 0) throw new Error("GOOGLE_CLIENT_ID is required");
	const parsed = v.safeParse(googleIdTokenClaimsSchema, claims);
	if (!parsed.success) {
		return Result.err({ _tag: "InvalidOAuthRequest" });
	}
	const audience = parsed.output.aud;
	const validAudience =
		typeof audience === "string"
			? audience === clientId
			: audience.includes(clientId);
	if (
		!validAudience ||
		parsed.output.exp <= nowSeconds ||
		(parsed.output.email !== undefined && parsed.output.email_verified !== true)
	) {
		return Result.err({ _tag: "InvalidOAuthRequest" });
	}
	return Result.ok(parsed.output);
};

export const classifyOAuthTokenError = (
	error: unknown,
): OAuthFailure | undefined => {
	if (error instanceof OAuth2RequestError) {
		return { _tag: "OAuthGrantRejected" };
	}
	if (
		error instanceof ArcticFetchError ||
		error instanceof UnexpectedResponseError ||
		error instanceof UnexpectedErrorResponseBodyError
	) {
		return { _tag: "OAuthProviderUnavailable", retryable: true };
	}
	return undefined;
};
