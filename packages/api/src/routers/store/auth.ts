import { TRPCError } from "@trpc/server";
import { customAlphabet } from "nanoid";
import * as v from "valibot";
import { createQueries } from "@vit/api/queries";
import type { DB } from "../../db";
import {
	auth as authCheck,
	createSession,
	invalidateSession,
	setSessionTokenCookie,
} from "../../lib/session/store";
import { customerProcedure, publicProcedure, router } from "../../lib/trpc";
import { smsGateway } from "@/lib/integrations";

export const auth = router({
	sendOtp: publicProcedure
		.input(
			v.object({
				phone: v.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				console.log("sendOtp called", input);

				const nanoid = customAlphabet("1234567890", 4);
				const otp = nanoid();
				console.log("otp", otp, input.phone);
				await ctx.kv.put(input.phone, otp, { expirationTtl: 3600 });
				console.log("sms auth",process.env.SMS_GATEWAY_LOGIN,process.env.SMS_GATEWAY_PASSWORD) 
				// Send SMS and wait for it to be sent
				const finalState = await smsGateway.sendSmsAndWait({
					message: `Tanii nevtreh kod ${otp}`,
					phoneNumbers: [`+976${input.phone}`],
				});
				console.log("SMS finalState", finalState);

				// Check if SMS failed to send
				if (finalState.state === "Failed") {
					const errorMsg =
						finalState.recipients[0]?.error ?? "Unknown SMS error";
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: `Failed to send OTP: ${errorMsg}`,
					});
				}

				return {
					success: true,
					message: "OTP sent successfully",
				};
			} catch (error) {
				console.error("error", error);
				throw error;
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
					const otpFromRedis = (await ctx.kv.get(input.phone)) as string;
					console.log(
						"otpFromRedis",
						otpFromRedis,
						input.otp,
						typeof otpFromRedis,
						typeof input.otp,
					);
					isValidOtp = otpFromRedis === input.otp;

					if (isValidOtp) {
						await ctx.kv.delete(input.phone);
					}
				}

				if (!isValidOtp) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "Invalid OTP",
					});
				}

				const user = await addCustomerToDB(input.phone, ctx.db);

				if (!user) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create or retrieve user",
					});
				}

				const { session, token } = await createSession(user, ctx.kv);

				setSessionTokenCookie(ctx.c, token, session.expiresAt);
				console.log("Session cookie set via resHeaders");

				return {
					success: true,
					user: session.user,
				};
			} catch (error) {
				console.error("Login error:", error);
				throw error;
			}
		}),

	logout: customerProcedure.mutation(async ({ ctx }) => {
		try {
			if (ctx.session) {
				await invalidateSession(ctx);
			}

			return { success: true };
		} catch (error) {
			console.error("Logout error:", error);
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
			console.log(e);
			console.error(e);
			return null;
		}
	}),
});

export const addCustomerToDB = async (phone: string, db: DB) => {
	try {
		const q = createQueries(db).customers.store;
		const user = await q.getCustomerByPhone(Number.parseInt(phone, 10));
		console.log("user", user);
		if (!user) {
			const newUser = await q.createCustomer({
				phone: Number.parseInt(phone, 10),
				address: "",
			});
			console.log("newUser", newUser);
			return newUser;
		}
		return user;
	} catch (error) {
		console.error(error);
	}
};
