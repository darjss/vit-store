import { TRPCError } from "@trpc/server";
import { userQueries } from "@vit/api/queries";
import * as v from "valibot";
import { adminAuth, invalidateAdminSession } from "~/lib/session/admin";
import { adminProcedure, publicProcedure, router } from "~/lib/trpc";
export const adminAuthRouter = router({
	createUser: adminProcedure
		.input(
			v.object({
				googleId: v.string(),
				isApproved: v.boolean(),
				username: v.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const { googleId, isApproved, username } = input;
				const user = await userQueries.admin.createUser(googleId, username, isApproved);
				if (!user) {
					throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
				}
				return {
					createdAt: user.createdAt,
					googleId: user.googleId,
					id: user.id,
					isApproved: user.isApproved,
					updatedAt: user.updatedAt,
					username: user.username,
				};
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "createUser",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create user",
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
				const result = await userQueries.admin.getUserFromGoogleId(googleId);
				return result;
			} catch (error) {
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "getUserFromGoogleId",
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get user from Google ID",
				});
			}
		}),
	logout: adminProcedure.mutation(async ({ ctx }) => {
		await invalidateAdminSession(ctx);
		return { success: true };
	}),
	me: publicProcedure.query(async ({ ctx }) => {
		const session = await adminAuth(ctx);
		ctx.log.info("me", { hasSession: !!session });
		return session;
	}),
});
