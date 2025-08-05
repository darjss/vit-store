import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { UserSelectType } from "@/db/schema";
import { UsersTable } from "@/db/schema";
import { adminAuth, invalidateAdminSession } from "@/lib/session/admin";
import { adminProcedure, publicProcedure, router } from "@/lib/trpc";

export const auth = router({
  me: publicProcedure.query(async ({ ctx }) => {
    const session = await adminAuth(ctx);
	console.log("returning session", session)
    return session;
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
      })
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
      })
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
