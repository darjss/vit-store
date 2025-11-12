import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "../../db";
import type { UserSelectType } from "../../db/schema";
import { UsersTable } from "../../db/schema";

export function adminUsers(db: DB) {
	return {
		async createUser(
			googleId: string,
			username: string,
			isApproved: boolean,
		): Promise<UserSelectType> {
			const result = await db
				.insert(UsersTable)
				.values({
					googleId,
					username,
					isApproved,
				})
				.returning();
			const [user] = result;
			if (user === null || user === undefined) {
				throw new Error("User not found");
			}
			return user;
		},

		async getUserFromGoogleId(googleId: string): Promise<UserSelectType | null> {
			const result = await db
				.select()
				.from(UsersTable)
				.where(
					and(eq(UsersTable.googleId, googleId), isNull(UsersTable.deletedAt)),
				);
			if (result.length < 1 || result[0] === undefined) {
				return null;
			}
			return result[0];
		},
	};
}

