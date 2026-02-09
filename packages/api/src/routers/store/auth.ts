import { TRPCError } from "@trpc/server";
import { customerQueries } from "@vit/api/queries";
import { createMinimalLogger } from "@vit/logger";
import { customAlphabet } from "nanoid";
import * as v from "valibot";
import { smsGateway } from "@/lib/integrations";
import { kv } from "../../lib/kv";
import {
	auth as authCheck,
	createSession,
	invalidateSession,
	setSessionTokenCookie,
} from "../../lib/session/store";
import { customerProcedure, publicProcedure, router } from "../../lib/trpc";

export const auth = router({
	sendOtp: publicProcedure
		.input(
			v.object({
				phone: v.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const nanoid = customAlphabet("1234567890", 4);
				const otp = nanoid();

				await kv().put(input.phone, otp, { expirationTtl: 3600 });

				ctx.log.auth.otpSent({ phone: Number(input.phone) });

				const finalState = await smsGateway.sendSmsAndWait({
					message: `Tanii nevtreh kod ${otp}`,
					phoneNumbers: [`+976${input.phone}`],
				});

				if (finalState.state === "Failed") {
					const errorMsg =
						finalState.recipients[0]?.error ?? "Unknown SMS error";

					ctx.log.error("auth.sms_failed", new Error(errorMsg), {
						phone: Number(input.phone),
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
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error("auth.send_otp_failed", error, {
					phone: Number(input.phone),
				});
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to send OTP",
					cause: error,
				});
			}
		}),

	login: publicProcedure
		.input(
			v.object({
				phone: v.string(),
				otp: v.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				let isValidOtp = false;

				if (process.env.NODE_ENV === "development") {
					isValidOtp = true;
				} else {
					const otpFromRedis = (await kv().get(input.phone)) as string;
					isValidOtp = otpFromRedis === input.otp;

					if (isValidOtp) {
						await kv().delete(input.phone);
					}
				}

				if (!isValidOtp) {
					ctx.log.auth.otpFailed({
						phone: Number(input.phone),
						failureReason: "invalid_otp",
					});

					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "Invalid OTP",
					});
				}

				ctx.log.auth.otpVerified({ phone: Number(input.phone) });

				const user = await addCustomerToDB(input.phone);

				if (!user) {
					ctx.log.error(
						"auth.customer_create_failed",
						new Error("No user returned"),
						{
							phone: Number(input.phone),
						},
					);

					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create or retrieve user",
					});
				}

				const { session, token } = await createSession(user, kv());
				setSessionTokenCookie(ctx.c, token, session.expiresAt);

				ctx.log.auth.loginSuccess({
					phone: Number(input.phone),
					sessionId: session.id,
				});

				return {
					success: true,
					user: session.user,
				};
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error("auth.login_failed", error, {
					phone: Number(input.phone),
				});
				throw error;
			}
		}),

	logout: customerProcedure.mutation(async ({ ctx }) => {
		try {
			if (ctx.session) {
				await invalidateSession(ctx);
				ctx.log.auth.logout({
					phone: ctx.session.user.phone,
				});
			}

			return { success: true };
		} catch (error) {
			ctx.log.error("auth.logout_failed", error);
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
		} catch (e) {
			ctx.log.error("auth.check_failed", e);
			return null;
		}
	}),
});

export const addCustomerToDB = async (phone: string) => {
	const log = createMinimalLogger();

	try {
		const q = customerQueries.store;
		const user = await q.getCustomerByPhone(Number.parseInt(phone, 10));

		if (!user) {
			const newUser = await q.createCustomer({
				phone: Number.parseInt(phone, 10),
				address: "",
			});

			log.info("customer.created", { phone: Number(phone) });
			return newUser;
		}

		return user;
	} catch (error) {
		log.error("customer.create_failed", error, { phone: Number(phone) });
		return undefined;
	}
};
