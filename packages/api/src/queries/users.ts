import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/db/client";
import type { UserSelectType } from "~/db/schema";
import { UsersTable } from "~/db/schema";

export const userQueries = {
	admin: {
		async createUser(
			googleId: string,
			username: string,
			isApproved: boolean,
		): Promise<UserSelectType> {
			const result = await db()
				.insert(UsersTable)
				.values({
					googleId,
					isApproved,
					username,
				})
				.returning();
			const [user] = result;
			if (user === null || user === undefined) {
				throw new Error("User not found");
			}
			return user;
		},

		async getUserFromGoogleId(googleId: string): Promise<UserSelectType | null> {
			const result = await db()
				.select()
				.from(UsersTable)
				.where(and(eq(UsersTable.googleId, googleId), isNull(UsersTable.deletedAt)));
			if (result.length < 1 || result[0] === undefined) {
				return null;
			}
			return result[0];
		},

		async updateUserByGoogleId(
			googleId: string,
			updates: {
				isApproved?: boolean;
				username?: string;
			},
		): Promise<UserSelectType | null> {
			const valuesToSet: {
				isApproved?: boolean;
				updatedAt: Date;
				username?: string;
			} = {
				updatedAt: new Date(),
			};

			if (updates.username !== undefined) {
				valuesToSet.username = updates.username;
			}

			if (updates.isApproved !== undefined) {
				valuesToSet.isApproved = updates.isApproved;
			}

			const result = await db()
				.update(UsersTable)
				.set(valuesToSet)
				.where(and(eq(UsersTable.googleId, googleId), isNull(UsersTable.deletedAt)))
				.returning();

			if (result.length < 1 || result[0] === undefined) {
				return null;
			}

			return result[0];
		},
	},
};
