export type TrpcErrorShape = {
	message: string;
	code: number;
	data: {
		code: string;
		httpStatus: number;
	};
};

function fallbackError(httpStatus: number): TrpcErrorShape {
	if (httpStatus === 400) {
		return {
			message: "Bad request",
			code: -32600,
			data: { code: "BAD_REQUEST", httpStatus },
		};
	}
	if (httpStatus === 404) {
		return {
			message: "Not found",
			code: -32004,
			data: { code: "NOT_FOUND", httpStatus },
		};
	}
	return {
		message: "Internal server error",
		code: -32603,
		data: { code: "INTERNAL_SERVER_ERROR", httpStatus },
	};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;
}

export type SanitizedTrpcResponse = {
	payload: unknown;
	hasError: boolean;
};

/** Keep only the stable, client-facing fields from a tRPC error shape. */
export function sanitizePublicTrpcErrorShape(
	value: unknown,
	fallbackHttpStatus = 500,
): TrpcErrorShape {
	const fallback = fallbackError(fallbackHttpStatus);
	const shape = asRecord(value);
	const data = asRecord(shape?.data);
	const dataCode =
		typeof data?.code === "string" ? data.code : fallback.data.code;
	const httpStatus =
		typeof data?.httpStatus === "number" ? data.httpStatus : fallbackHttpStatus;
	const isInternalError = dataCode === "INTERNAL_SERVER_ERROR";

	return {
		message:
			!isInternalError && typeof shape?.message === "string"
				? shape.message
				: isInternalError
					? "Internal server error"
					: fallback.message,
		code: typeof shape?.code === "number" ? shape.code : fallback.code,
		data: {
			code: dataCode,
			httpStatus,
		},
	};
}

function sanitizeResponseItem(
	value: unknown,
	fallbackHttpStatus: number,
): SanitizedTrpcResponse {
	const item = asRecord(value);
	if (!item || !("error" in item)) {
		return { payload: value, hasError: false };
	}

	const error = asRecord(item.error);
	const serializedShape = asRecord(error?.json);
	return {
		payload: {
			...item,
			error: serializedShape
				? {
						json: sanitizePublicTrpcErrorShape(
							serializedShape,
							fallbackHttpStatus,
						),
					}
				: sanitizePublicTrpcErrorShape(error, fallbackHttpStatus),
		},
		hasError: true,
	};
}

/** Sanitize singular and batch tRPC JSON responses without changing wire shape. */
export function sanitizePublicTrpcResponse(
	value: unknown,
	fallbackHttpStatus = 500,
): SanitizedTrpcResponse {
	if (!Array.isArray(value)) {
		return sanitizeResponseItem(value, fallbackHttpStatus);
	}

	let hasError = false;
	const payload = value.map((item) => {
		const sanitized = sanitizeResponseItem(item, fallbackHttpStatus);
		hasError ||= sanitized.hasError;
		return sanitized.payload;
	});
	return { payload, hasError };
}
