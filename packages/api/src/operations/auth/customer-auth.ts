import { customerQueries } from "~/queries";
import type { LoginError, SendOtpError, SessionError } from "@vit/shared";
import { customerSessionSchema } from "@vit/shared";
import { Result } from "better-result";
import { match } from "dismatch";
import { customAlphabet } from "nanoid";
import * as v from "valibot";
import { authErrors } from "~/errors/factories/auth";
import { smsGateway, type SmsMessageState } from "~/lib/integrations";
import { kv } from "~/lib/kv";
import { redis } from "~/lib/redis";
import type { CustomerSessionClaims } from "~/lib/session/checkout-access";
import {
	auth as authenticateCustomer,
	createSession,
	invalidateSession,
	setSessionTokenCookie,
} from "~/lib/session/store";
import type { Context, CustomerSelectType } from "~/lib/context";

const OTP_TTL_SECONDS = 5 * 60;
const OTP_SEND_WINDOW_SECONDS = 60 * 60;
const OTP_SEND_LIMIT = 3;
const OTP_ATTEMPT_WINDOW_SECONDS = 15 * 60;
const OTP_ATTEMPT_LIMIT = 5;

type SmsDeliveryState =
	| { state: "Pending" }
	| { state: "Processed" }
	| { state: "Sent" }
	| { state: "Delivered" }
	| { state: "Failed" };

const smsDeliveryStates = {
	Pending: { state: "Pending" },
	Processed: { state: "Processed" },
	Sent: { state: "Sent" },
	Delivered: { state: "Delivered" },
	Failed: { state: "Failed" },
} satisfies Record<SmsMessageState["state"], SmsDeliveryState>;

const consumeRateLimit = async (key: string, windowSeconds: number) => {
	const client = redis();
	const count = await client.incr(key);
	if (count === 1) await client.expire(key, windowSeconds);
	const ttl = count > 1 ? await client.ttl(key) : windowSeconds;
	return {
		count,
		retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
	};
};

const addCustomerToDatabase = async (phone: string) => {
	const query = customerQueries.store;
	const numericPhone = Number.parseInt(phone, 10);
	const existing = await query.getCustomerByPhone(numericPhone);
	if (existing) return existing;

	const customer = await query.createCustomer({
		phone: numericPhone,
		address: "",
	});
	if (!customer) {
		throw new Error("Customer insert returned no customer");
	}
	return customer;
};

export const sendOtpOperation = async (
	input: { phone: string },
	ctx: Context,
) => {
	const rateLimit = await consumeRateLimit(
		`otp:send:${input.phone}`,
		OTP_SEND_WINDOW_SECONDS,
	);
	if (rateLimit.count > OTP_SEND_LIMIT) {
		ctx.log.warn("auth.otp_failed", {
			failureReason: "otp_send_rate_limited",
		});
		return Result.err<{ success: true; message: string }, SendOtpError>(
			authErrors.otpSendRateLimited(rateLimit.retryAfterSeconds),
		);
	}

	const otp = customAlphabet("1234567890", 4)();
	await kv().put(`otp:code:${input.phone}`, otp, {
		expirationTtl: OTP_TTL_SECONDS,
	});

	const delivery = await Result.tryPromise({
		try: () =>
			smsGateway.sendSmsAndWait({
				message: `Tanii nevtreh kod ${otp}`,
				phoneNumbers: [`+976${input.phone}`],
			}),
		catch: () => authErrors.otpDeliveryUnavailable(true),
	});

	return delivery.match({
		err: (error) => {
			ctx.log.warn("auth.sms_failed", {
				failureReason: "delivery_unavailable",
			});
			return Result.err<{ success: true; message: string }, SendOtpError>(
				error,
			);
		},
		ok: (finalState) =>
			match(
				smsDeliveryStates[finalState.state],
				"state",
			)<Result<{ success: true; message: string }, SendOtpError>>({
				Pending: () => Result.err(authErrors.otpDeliveryUnavailable(true)),
				Processed: () =>
					Result.ok({ success: true, message: "OTP sent successfully" }),
				Sent: () =>
					Result.ok({ success: true, message: "OTP sent successfully" }),
				Delivered: () =>
					Result.ok({ success: true, message: "OTP sent successfully" }),
				Failed: () => Result.err(authErrors.otpDeliveryUnavailable(true)),
			}),
	});
};

export const loginOperation = async (
	input: { phone: string; otp: string },
	ctx: Context,
) => {
	const attemptKey = `otp:attempt:${input.phone}`;
	const rateLimit = await consumeRateLimit(
		attemptKey,
		OTP_ATTEMPT_WINDOW_SECONDS,
	);
	if (rateLimit.count > OTP_ATTEMPT_LIMIT) {
		ctx.log.warn("auth.otp_failed", {
			failureReason: "otp_attempt_rate_limited",
		});
		return Result.err<{ success: true; user: CustomerSelectType }, LoginError>(
			authErrors.otpAttemptRateLimited(rateLimit.retryAfterSeconds),
		);
	}

	const isDevelopment = process.env.NODE_ENV === "development";
	const storedOtp = isDevelopment
		? input.otp
		: await kv().get(`otp:code:${input.phone}`);
	if (storedOtp !== input.otp) {
		ctx.log.warn("auth.otp_failed", { failureReason: "invalid_otp" });
		return Result.err<{ success: true; user: CustomerSelectType }, LoginError>(
			authErrors.otpInvalidOrExpired(),
		);
	}

	if (!isDevelopment) {
		await Promise.all([
			kv().delete(`otp:code:${input.phone}`),
			redis().del(attemptKey),
		]);
	}

	const user = await addCustomerToDatabase(input.phone);
	const verifiedUser = {
		...user,
		trust: "phone_verified" as const,
	} satisfies typeof user & CustomerSessionClaims;
	const { session, token } = await createSession(verifiedUser, kv());
	setSessionTokenCookie(ctx.c, token, session.expiresAt);
	ctx.log.info("auth.login_success", { sessionId: session.id });

	return Result.ok<{ success: true; user: CustomerSelectType }, LoginError>({
		success: true,
		user: session.user,
	});
};

export const checkSessionOperation = async (
	ctx: Context,
	authenticate: typeof authenticateCustomer = authenticateCustomer,
) => {
	const session = await authenticate(ctx);
	if (!session) {
		return Result.err<CustomerSelectType, SessionError>(
			authErrors.sessionExpired(),
		);
	}
	v.parse(customerSessionSchema, session.user);
	return Result.ok<CustomerSelectType, SessionError>(session.user);
};

export const logoutOperation = async (ctx: Context) => {
	if (ctx.session) await invalidateSession(ctx);
	return { success: true as const };
};
