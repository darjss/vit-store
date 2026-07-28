type DatabaseErrorLike = {
	code?: unknown;
	constraint?: unknown;
	constraint_name?: unknown;
};

const asDatabaseError = (error: unknown): DatabaseErrorLike | undefined =>
	error !== null && typeof error === "object"
		? (error as DatabaseErrorLike)
		: undefined;

export const databaseErrorCode = (error: unknown) => {
	const code = asDatabaseError(error)?.code;
	return typeof code === "string" ? code : undefined;
};

export const databaseConstraint = (error: unknown) => {
	const candidate = asDatabaseError(error);
	const constraint = candidate?.constraint ?? candidate?.constraint_name;
	return typeof constraint === "string" ? constraint : undefined;
};

export const isUniqueViolation = (error: unknown) =>
	databaseErrorCode(error) === "23505";

export const isForeignKeyViolation = (error: unknown) =>
	databaseErrorCode(error) === "23503";
