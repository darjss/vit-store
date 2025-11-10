import { TRPCError } from "@trpc/server";
import { customAlphabet } from "nanoid";
import * as v from "valibot";
import { storeQueries } from "@vit/api/queries";
import type { Context } from "../../lib/context";
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
				console.log("sendOtp called", input);

				const nanoid = customAlphabet("1234567890", 4);
				const otp = nanoid();
				console.log("otp", otp, input.phone);
				await ctx.kv.put(input.phone, otp, { expirationTtl: 3600 });
				// const body = {
				//   message: `Tanii nevtreh kod ${otp}`,
				//   phoneNumbers: [`+976${input.phone}`],
				//   simNumber: 2,
				//   ttl: 3600,
				//   withDeliveryReport: true,
				//   priority: 100,
				// };
				// console.log("body", body);
				// const response = await fetch(
				//   "https://api.sms-gate.app/3rdparty/v1/messages",
				//   {
				//     method: "POST",
				//     headers: {
				//       "Content-Type": "application/json",
				//       Authorization: "Basic UTFTM1FQOi16djJzeF9sMms2bnBy",
				//     },
				//     body: JSON.stringify(body),
				//   }
				// );

				// if (!response.ok) {
				//   const errorText = await response.text();
				//   throw new Error(
				//     `HTTP error! status: ${response.status}, message: ${errorText}`
				//   );
				// }
				//   console.log("response", response);
				//   return response;
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

				const user = await addCustomerToDB(input.phone);

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
			if(session===null){
				return null
			}
			return session?.user;
		} catch (e) {
			console.log(e);
			console.error(e);
			return null;
		}
	}),
});

export const addCustomerToDB = async (phone: string) => {
	try {
		const user = await storeQueries.getCustomerByPhone(Number.parseInt(phone, 10));
		console.log("user", user);
		if (!user) {
			const newUser = await storeQueries.createCustomer({
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
