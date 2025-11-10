import { TRPCError } from "@trpc/server";
import { adminQueries } from "@vit/api/queries";
import * as v from "valibot";
import { adminAuth, invalidateAdminSession } from "../../lib/session/admin";
import { adminProcedure, publicProcedure, router } from "../../lib/trpc";

export const auth = router({
	me: publicProcedure.query(async ({ ctx }) => {
		const session = await adminAuth(ctx);
		console.log("returning session", session);
		return session;
	}),

	logout: adminProcedure.mutation(async ({ ctx }) => {
		await invalidateAdminSession(ctx);
		return { success: true };
	}),

	createUser: adminProcedure
		.input(
			v.object({
				googleId: v.string(),
				username: v.string(),
				isApproved: v.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { googleId, username, isApproved } = input;
				const user = await adminQueries.createUser(
					googleId,
					username,
					isApproved,
				);

				if (!user) {
					throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
				}

				return {
					id: user.id,
					username: user.username,
					googleId: user.googleId,
					isApproved: user.isApproved,
					createdAt: user.createdAt,
					updatedAt: user.updatedAt,
				};
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
			v.object({
				googleId: v.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				const { googleId } = input;
				const result = await adminQueries.getUserFromGoogleId(googleId);
				return result;
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
