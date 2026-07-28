import { TRPCError } from "@trpc/server";
import * as v from "valibot";
import { adminAuth, invalidateAdminSession } from "~/lib/session/admin";
import { adminProcedure, publicProcedure, router } from "~/lib/trpc";
import {
	adminUserResultSchemas,
	createAdminUser,
} from "~/operations/admin-auth";
import { serializeOperationResult } from "~/operations/serialize-operation-result";
import { userQueries } from "~/queries/users";
import { runLegacyOperation } from "~/result/run-legacy-operation";

const createUserInputSchema = v.object({
	googleId: v.string(),
	username: v.string(),
	isApproved: v.boolean(),
});

export const adminAuthRouter = router({
	me: publicProcedure.query(async ({ ctx }) => {
		const session = await adminAuth(ctx);
		ctx.log.info("me", { hasSession: !!session });
		return session;
	}),
	logout: adminProcedure.mutation(async ({ ctx }) => {
		await invalidateAdminSession(ctx);
		return { success: true };
	}),
	createUser: adminProcedure
		.input(createUserInputSchema)
		.mutation(({ ctx, input }) =>
			runLegacyOperation(
				ctx,
				"createUser",
				"Failed to create user",
				() => createAdminUser(input),
				() => ({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create user",
				}),
			),
		),
	getUserFromGoogleId: adminProcedure
		.input(v.object({ googleId: v.string() }))
		.query(async ({ ctx, input }) => {
			try {
				return await userQueries.admin.getUserFromGoogleId(input.googleId);
			} catch (error) {
				ctx.log.error(
					error instanceof Error ? error : new Error(String(error)),
					{
						event: "getUserFromGoogleId",
					},
				);
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to get user from Google ID",
					cause: error,
				});
			}
		}),
});

export const adminAuthV2Router = router({
	createUser: adminProcedure
		.input(createUserInputSchema)
		.mutation(async ({ ctx, input }) =>
			serializeOperationResult(
				ctx,
				await createAdminUser(input),
				adminUserResultSchemas,
				{ operation: "admin.auth.create_user", error_layer: "domain" },
			),
		),
});
