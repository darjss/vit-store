import { TRPCError } from "@trpc/server";
import { customerQueries } from "@vit/api/queries";
import { logger } from "~/lib/logger";
import { customAlphabet } from "nanoid";
import * as v from "valibot";
import { smsGateway } from "~/lib/integrations";
import { kv } from "~/lib/kv";
import { redis } from "~/lib/redis";
import type { CustomerSessionClaims } from "~/lib/session/checkout-access";
import { auth as authCheck, createSession, invalidateSession, setSessionTokenCookie, } from "~/lib/session/store";
import { customerProcedure, publicProcedure, router } from "~/lib/trpc";
const OTP_TTL_SECONDS = 5 * 60;
const OTP_SEND_WINDOW_SECONDS = 60 * 60;
const OTP_SEND_LIMIT = 3;
const OTP_ATTEMPT_WINDOW_SECONDS = 15 * 60;
const OTP_ATTEMPT_LIMIT = 5;
const phoneInputSchema = v.pipe(v.string(), v.regex(/^[6-9]\d{7}$/));
async function enforceRateLimit(key: string, windowSeconds: number): Promise<number> {
    const count = await redis().incr(key);
    if (count === 1) {
        await redis().expire(key, windowSeconds);
    }
    return count;
}
export const storeAuthRouter = router({
    sendOtp: publicProcedure
        .input(v.object({
        phone: phoneInputSchema,
    }))
        .mutation(async ({ input, ctx }) => {
        try {
            const sendCount = await enforceRateLimit(`otp:send:${input.phone}`, OTP_SEND_WINDOW_SECONDS);
            if (sendCount > OTP_SEND_LIMIT) {
                ctx.log.warn("auth.otp_failed", {
                    phone: Number(input.phone),
                    failureReason: "otp_send_rate_limited",
                });
                throw new TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: "Too many OTP requests. Please try again later.",
                });
            }
            const nanoid = customAlphabet("1234567890", 4);
            const otp = nanoid();
            await kv().put(`otp:code:${input.phone}`, otp, {
                expirationTtl: OTP_TTL_SECONDS,
            });
            ctx.log.info("auth.otp_sent", { phone: Number(input.phone) });
            const finalState = await smsGateway.sendSmsAndWait({
                message: `Tanii nevtreh kod ${otp}`,
                phoneNumbers: [`+976${input.phone}`],
            });
            if (finalState.state === "Failed") {
                const errorMsg = finalState.recipients[0]?.error ?? "Unknown SMS error";
                ctx.log.error(new Error(errorMsg) instanceof Error ? new Error(errorMsg) : new Error(String(new Error(errorMsg))), {
                    event: "auth.sms_failed",
                    phone: Number(input.phone)
                });
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: `Failed to send OTP: ${errorMsg}`,
                });
            }
            ctx.log.info("auth.sms_sent", { phone: Number(input.phone) });
            return {
                success: true,
                message: "OTP sent successfully",
            };
        }
        catch (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "auth.send_otp_failed",
                phone: Number(input.phone)
            });
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to send OTP",
                cause: error,
            });
        }
    }),
    login: publicProcedure
        .input(v.object({
        phone: phoneInputSchema,
        otp: v.pipe(v.string(), v.regex(/^\d{4}$/)),
    }))
        .mutation(async ({ input, ctx }) => {
        try {
            const attemptKey = `otp:attempt:${input.phone}`;
            const attemptCount = await enforceRateLimit(attemptKey, OTP_ATTEMPT_WINDOW_SECONDS);
            if (attemptCount > OTP_ATTEMPT_LIMIT) {
                ctx.log.warn("auth.otp_failed", {
                    phone: Number(input.phone),
                    failureReason: "otp_attempt_rate_limited",
                });
                throw new TRPCError({
                    code: "TOO_MANY_REQUESTS",
                    message: "Too many OTP attempts. Please try again later.",
                });
            }
            let isValidOtp = false;
            if (process.env.NODE_ENV === "development") {
                isValidOtp = true;
            }
            else {
                const otpFromKv = (await kv().get(`otp:code:${input.phone}`)) as string;
                isValidOtp = otpFromKv === input.otp;
                if (isValidOtp) {
                    await Promise.all([
                        kv().delete(`otp:code:${input.phone}`),
                        redis().del(attemptKey),
                    ]);
                }
            }
            if (!isValidOtp) {
                ctx.log.warn("auth.otp_failed", {
                    phone: Number(input.phone),
                    failureReason: "invalid_otp",
                });
                throw new TRPCError({
                    code: "UNAUTHORIZED",
                    message: "Invalid OTP",
                });
            }
            ctx.log.info("auth.otp_verified", { phone: Number(input.phone) });
            const user = await addCustomerToDB(input.phone);
            if (!user) {
                ctx.log.error(new Error("Failed to create or retrieve user"), {
                    event: "auth.customer_create_failed",
                    phone: Number(input.phone),
                });
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to create or retrieve user",
                });
            }
            const verifiedUser = {
                ...user,
                trust: "phone_verified" as const,
            } satisfies typeof user & CustomerSessionClaims;
            const { session, token } = await createSession(verifiedUser, kv());
            setSessionTokenCookie(ctx.c, token, session.expiresAt);
            ctx.log.info("auth.login_success", {
                phone: Number(input.phone),
                sessionId: session.id,
            });
            return {
                success: true,
                user: session.user,
            };
        }
        catch (error) {
            if (error instanceof TRPCError) {
                throw error;
            }
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "auth.login_failed",
                phone: Number(input.phone)
            });
            throw error;
        }
    }),
    logout: customerProcedure.mutation(async ({ ctx }) => {
        try {
            if (ctx.session) {
                await invalidateSession(ctx);
                ctx.log.info("auth.logout", {
                    phone: ctx.session.user.phone,
                });
            }
            return { success: true };
        }
        catch (error) {
            ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
                event: "auth.logout_failed"
            });
            throw error;
        }
    }),
    me: customerProcedure.query(async ({ ctx }) => {
        return ctx.session.user;
    }),
    check: publicProcedure.query(async ({ ctx }) => {
        try {
            const session = await authCheck(ctx);
            if (session === null) {
                return null;
            }
            return session?.user;
        }
        catch (e) {
            ctx.log.error(e instanceof Error ? e : new Error(String(e)), {
                event: "auth.check_failed"
            });
            return null;
        }
    }),
});
export const addCustomerToDB = async (phone: string) => {
    try {
        const q = customerQueries.store;
        const user = await q.getCustomerByPhone(Number.parseInt(phone, 10));
        if (!user) {
            const newUser = await q.createCustomer({
                phone: Number.parseInt(phone, 10),
                address: "",
            });
            logger.info("customer.created", { phone: Number(phone) });
            return newUser;
        }
        return user;
    }
    catch (error) {
        logger.error("customer.create_failed", error, { phone: Number(phone) });
        return undefined;
    }
};
