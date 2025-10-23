import { and, eq, isNull } from "drizzle-orm";
import type { UserSelectType } from "../db/schema";
import { UsersTable } from "../db/schema";
import { db } from "../db";

export const createUser = async (
	googleId: string,
	username: string,
	isApproved: boolean,
): Promise<UserSelectType> => {
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
};

export const getUserFromGoogleId = async (
	googleId: string,
): Promise<UserSelectType | null> => {
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
};
