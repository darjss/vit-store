import { adminProcedure, router } from "@/lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { UserSelectType } from "@/db/schema";
import { UsersTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Session } from "@/lib/types";

export const auth = router({
	login: adminProcedure
		.input(
			z.object({
				email: z.string(),
				password: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { email, password } = input;
			// TODO: Implement login logic
			return { success: true };
		}),

	insertSession: adminProcedure
		.input(
			z.object({
				session: z.object({
					id: z.string(),
					userId: z.string(),
					expiresAt: z.date(),
					user: z.object({
						id: z.number(),
						username: z.string(),
						googleId: z.string().nullable(),
						isApproved: z.boolean(),
						createdAt: z.date(),
						updatedAt: z.date().nullable(),
					}),
				}),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { session } = input;
				const sessionToStore = {
					...session,
					expiresAt: session.expiresAt.toISOString(),
				};
				await ctx.kv.put(
					`admin_session:${session.id}`,
					JSON.stringify(sessionToStore),
				);
				return { success: true };
			} catch (error) {
				console.error("Error inserting session:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to insert session",
					cause: error,
				});
			}
		}),

	getSession: adminProcedure
		.input(
			z.object({
				sessionId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { sessionId } = input;
				console.log("Getting session from KV");
				const sessionData = await ctx.kv.get(`admin_session:${sessionId}`);

				if (!sessionData) {
					return { session: null, user: null };
				}

				const session = JSON.parse(sessionData) as Session;
				const user = session.user;

				if (!user) {
					return { session: null, user: null };
				}

				console.log("Session result", session);
				return {
					session: session as Session,
					user: user as unknown as UserSelectType,
				};
			} catch (error) {
				console.error("Error getting session:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get session",
					cause: error,
				});
			}
		}),

	kvBenchmark: adminProcedure.query(async ({ ctx }) => {
		try {
			if (process.env.NODE_ENV === "production") {
				const setStart = performance.now();
				await ctx.kv.put("test", "test");
				const setEnd = performance.now();
				const getStart = performance.now();
				await ctx.kv.get("test");
				const getEnd = performance.now();
				return {
					set: setEnd - setStart,
					get: getEnd - getStart,
				};
			}
			return {
				set: 0,
				get: 0,
			};
		} catch (error) {
			console.error("Error in KV benchmark:", error);
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to run KV benchmark",
				cause: error,
			});
		}
	}),

	deleteSession: adminProcedure
		.input(
			z.object({
				sessionId: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { sessionId } = input;
				await ctx.kv.delete(`admin_session:${sessionId}`);
				return { success: true };
			} catch (error) {
				console.error("Error deleting session:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete session",
					cause: error,
				});
			}
		}),

	updateSession: adminProcedure
		.input(
			z.object({
				session: z.object({
					id: z.string(),
					userId: z.string(),
					expiresAt: z.date(),
					user: z.object({
						id: z.number(),
						username: z.string(),
						googleId: z.string().nullable(),
						isApproved: z.boolean(),
						createdAt: z.date(),
						updatedAt: z.date().nullable(),
					}),
				}),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { session } = input;
				await ctx.kv.put(
					`admin_session:${session.id}`,
					JSON.stringify(session),
				);
				return { success: true };
			} catch (error) {
				console.error("Error updating session:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to update session",
					cause: error,
				});
			}
		}),

	createUser: adminProcedure
		.input(
			z.object({
				googleId: z.string(),
				username: z.string(),
				isApproved: z.boolean().default(false),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { googleId, username, isApproved } = input;
				const [user] = await ctx.db
					.insert(UsersTable)
					.values({
						googleId,
						username,
						isApproved,
					})
					.returning({
						id: UsersTable.id,
						username: UsersTable.username,
						googleId: UsersTable.googleId,
						isApproved: UsersTable.isApproved,
						createdAt: UsersTable.createdAt,
						updatedAt: UsersTable.updatedAt,
					});

				if (!user) {
					throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
				}

				return user;
			} catch (error) {
				console.error("Error creating user:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create user",
					cause: error,
				});
			}
		}),

	getUserFromGoogleId: adminProcedure
		.input(
			z.object({
				googleId: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { googleId } = input;
				const result = await ctx.db
					.select({ user: UsersTable })
					.from(UsersTable)
					.where(eq(UsersTable.googleId, googleId));

				if (result.length < 1 || result[0] === undefined) {
					return null;
				}

				return result[0].user as UserSelectType;
			} catch (error) {
				console.error("Error getting user from Google ID:", error);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get user from Google ID",
					cause: error,
				});
			}
		}),
});
