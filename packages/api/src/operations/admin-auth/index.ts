import { adminUserSchema, catalogMutationErrorSchema } from "@vit/shared";
import { Result } from "better-result";
import { catalogResourceNotFound } from "~/errors/factories/admin";
import { userQueries } from "~/queries/users";

export const adminUserResultSchemas = {
	value: adminUserSchema,
	error: catalogMutationErrorSchema,
};

export const createAdminUser = async (input: {
	googleId: string;
	username: string;
	isApproved: boolean;
}) => {
	const user = await userQueries.admin.createUser(
		input.googleId,
		input.username,
		input.isApproved,
	);
	if (!user) {
		return Result.err(catalogResourceNotFound("admin-user", input.googleId));
	}
	return Result.ok({
		id: user.id,
		username: user.username,
		googleId: user.googleId,
		isApproved: user.isApproved,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	});
};
