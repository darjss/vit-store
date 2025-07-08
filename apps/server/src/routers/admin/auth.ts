import { adminProcedure, publicProcedure, router } from "@/lib/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { UserSelectType } from "@/db/schema";
import { UsersTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
	createAdminSession,
	invalidateAdminSession,
	setAdminSessionTokenCookie,
} from "@/lib/session/admin";
import type { Session } from "@/lib/session";

export const auth = router({
	login: publicProcedure
		.input(
			z.object({
				email: z.string().email(),
				password: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { email, password } = input;

			// TODO: Implement proper authentication logic here
			// For now, this is a placeholder - you'll need to add:
			// 1. Password verification
			// 2. User lookup by email
			// 3. Rate limiting
			// 4. Proper error handling

			// Example user lookup (replace with your actual logic)
			const users = await ctx.db
				.select()
				.from(UsersTable)
				.where(eq(UsersTable.username, email)); // Assuming email is stored in username field

			const user = users[0];

			if (!user || !user.isApproved) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Invalid credentials or user not approved",
				});
			}

			// Create session using the new session manager
			const { session, token } = await createAdminSession(user, ctx);
			setAdminSessionTokenCookie(ctx, token, session.expiresAt);

			return {
				success: true,
				user: {
					id: user.id,
					username: user.username,
					isApproved: user.isApproved,
				},
			};
		}),

	me: adminProcedure.query(async ({ ctx }) => {
		// The adminProcedure middleware already validates the session
		// ctx.session is guaranteed to exist here
		const session = ctx.session as Session<UserSelectType>;

		return {
			user: session.user,
			sessionId: session.id,
			expiresAt: session.expiresAt,
		};
	}),

	logout: adminProcedure.mutation(async ({ ctx }) => {
		await invalidateAdminSession(ctx);
		return { success: true };
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
