import type { AuthError } from "@vit/shared";
import {
	loginResultSchemas,
	sendOtpResultSchemas,
	serializeResult,
	sessionResultSchemas,
} from "@vit/shared";
import { match } from "dismatch";
import * as v from "valibot";
import {
	checkSessionOperation,
	loginOperation,
	logoutOperation,
	sendOtpOperation,
} from "~/operations/auth/customer-auth";
import type { LegacyTrpcError } from "~/result/legacy-trpc";
import { toLegacyTrpc } from "~/result/legacy-trpc";
import { customerProcedure, publicProcedure, router } from "~/lib/trpc";

const phoneInputSchema = v.pipe(v.string(), v.regex(/^[6-9]\d{7}$/));
const sendOtpInputSchema = v.object({ phone: phoneInputSchema });
const loginInputSchema = v.object({
	phone: phoneInputSchema,
	otp: v.pipe(v.string(), v.regex(/^\d{4}$/)),
});

const toLegacyAuthError = (error: AuthError) =>
	match(
		error,
		"_tag",
	)<LegacyTrpcError>({
		OtpSendRateLimited: () => ({
			code: "TOO_MANY_REQUESTS",
			message: "Too many OTP requests. Please try again later.",
		}),
		OtpAttemptRateLimited: () => ({
			code: "TOO_MANY_REQUESTS",
			message: "Too many OTP attempts. Please try again later.",
		}),
		OtpInvalidOrExpired: () => ({
			code: "UNAUTHORIZED",
			message: "Invalid OTP",
		}),
		OtpDeliveryUnavailable: () => ({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to send OTP",
		}),
		PhoneVerificationRequired: () => ({
			code: "UNAUTHORIZED",
			message: "Phone verification required",
		}),
		SessionExpired: () => ({
			code: "UNAUTHORIZED",
			message: "Unauthorized",
		}),
	});

export const storeAuthRouter = router({
	sendOtp: publicProcedure
		.input(sendOtpInputSchema)
		.mutation(async ({ input, ctx }) =>
			toLegacyTrpc(await sendOtpOperation(input, ctx), toLegacyAuthError),
		),
	login: publicProcedure
		.input(loginInputSchema)
		.mutation(async ({ input, ctx }) =>
			toLegacyTrpc(await loginOperation(input, ctx), toLegacyAuthError),
		),
	logout: customerProcedure.mutation(({ ctx }) => logoutOperation(ctx)),
	me: customerProcedure.query(({ ctx }) => ctx.session.user),
	check: publicProcedure.query(async ({ ctx }) =>
		(await checkSessionOperation(ctx)).match({
			ok: (user) => user,
			err: () => null,
		}),
	),
});

export const storeAuthV2Router = router({
	sendOtp: publicProcedure
		.input(sendOtpInputSchema)
		.mutation(async ({ input, ctx }) =>
			serializeResult(await sendOtpOperation(input, ctx), sendOtpResultSchemas),
		),
	login: publicProcedure
		.input(loginInputSchema)
		.mutation(async ({ input, ctx }) =>
			serializeResult(await loginOperation(input, ctx), loginResultSchemas),
		),
	logout: customerProcedure.mutation(({ ctx }) => logoutOperation(ctx)),
	me: customerProcedure.query(({ ctx }) => ctx.session.user),
	check: publicProcedure.query(async ({ ctx }) =>
		serializeResult(await checkSessionOperation(ctx), sessionResultSchemas),
	),
});
