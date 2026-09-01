export type TrpcErrorShape = {
	code: number;
	data: {
		code: string;
		httpStatus: number;
	};
	message: string;
};

function fallbackError(httpStatus: number): TrpcErrorShape {
	if (httpStatus === 400) {
		return {
			code: -32_600,
			data: { code: "BAD_REQUEST", httpStatus },
			message: "Bad request",
		};
	}
	if (httpStatus === 404) {
		return {
			code: -32_004,
			data: { code: "NOT_FOUND", httpStatus },
			message: "Not found",
		};
	}
	return {
		code: -32_603,
		data: { code: "INTERNAL_SERVER_ERROR", httpStatus },
		message: "Internal server error",
	};
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;
}

export type SanitizedTrpcResponse = {
	hasError: boolean;
	payload: unknown;
};

/** Keep only the stable, client-facing fields from a tRPC error shape. */
export function sanitizePublicTrpcErrorShape(
	value: unknown,
	fallbackHttpStatus = 500,
): TrpcErrorShape {
	const fallback = fallbackError(fallbackHttpStatus);
	const shape = asRecord(value);
	const data = asRecord(shape?.data);
	const dataCode = typeof data?.code === "string" ? data.code : fallback.data.code;
	const httpStatus = typeof data?.httpStatus === "number" ? data.httpStatus : fallbackHttpStatus;
	const isInternalError = dataCode === "INTERNAL_SERVER_ERROR";

	return {
		code: typeof shape?.code === "number" ? shape.code : fallback.code,
		data: {
			code: dataCode,
			httpStatus,
		},
		message:
			!isInternalError && typeof shape?.message === "string"
				? shape.message
				: isInternalError
					? "Internal server error"
					: fallback.message,
	};
}

function sanitizeResponseItem(value: unknown, fallbackHttpStatus: number): SanitizedTrpcResponse {
	const item = asRecord(value);
	if (!item || !("error" in item)) {
		return { hasError: false, payload: value };
	}

	const error = asRecord(item.error);
	const serializedShape = asRecord(error?.json);
	return {
		hasError: true,
		payload: {
			...item,
			error: serializedShape
				? {
						json: sanitizePublicTrpcErrorShape(serializedShape, fallbackHttpStatus),
					}
				: sanitizePublicTrpcErrorShape(error, fallbackHttpStatus),
		},
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
	return { hasError, payload };
}
