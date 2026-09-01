import * as v from "valibot";

export const trpcPublicErrorSchema = v.object({
	code: v.number(),
	data: v.object({
		code: v.string(),
		httpStatus: v.number(),
	}),
	message: v.string(),
});

export type TrpcPublicError = v.InferOutput<typeof trpcPublicErrorSchema>;

export const trpcPublicErrorWireSchema = v.object({
	code: v.optional(v.number()),
	data: v.optional(
		v.object({
			code: v.optional(v.string()),
			httpStatus: v.optional(v.number()),
		}),
	),
	message: v.optional(v.string()),
});

export type TrpcPublicErrorWire = v.InferOutput<typeof trpcPublicErrorWireSchema>;

const trpcSerializedErrorWireSchema = v.object({
	json: v.optional(v.unknown()),
});

const trpcResponseItemWireSchema = v.looseObject({
	error: v.optional(
		v.union([trpcSerializedErrorWireSchema, trpcPublicErrorWireSchema, v.unknown()]),
	),
});

export const trpcResponseWireSchema = v.union([
	trpcResponseItemWireSchema,
	v.array(trpcResponseItemWireSchema),
]);

export type TrpcResponseWire = v.InferOutput<typeof trpcResponseWireSchema>;

function fallbackError(httpStatus: number): TrpcPublicError {
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

/** Keep only stable, client-facing fields from a parsed tRPC error wire object. */
export function sanitizePublicTrpcError(
	wire: TrpcPublicErrorWire | undefined,
	fallbackHttpStatus = 500,
): TrpcPublicError {
	const fallback = fallbackError(fallbackHttpStatus);
	const parsed = v.safeParse(trpcPublicErrorWireSchema, wire);
	if (!parsed.success) {
		return fallback;
	}

	const error = parsed.output;
	const dataCode = error.data?.code ?? fallback.data.code;
	const httpStatus = error.data?.httpStatus ?? fallbackHttpStatus;
	const isInternalError = dataCode === "INTERNAL_SERVER_ERROR";

	return {
		code: error.code ?? fallback.code,
		data: {
			code: dataCode,
			httpStatus,
		},
		message:
			!isInternalError && error.message
				? error.message
				: isInternalError
					? "Internal server error"
					: fallback.message,
	};
}

export type SanitizedTrpcResponse = {
	hasError: boolean;
	payload: TrpcResponseWire;
};

function sanitizeNestedTrpcError(
	error: v.InferOutput<typeof trpcResponseItemWireSchema>["error"],
	fallbackHttpStatus: number,
): TrpcPublicError | { json: TrpcPublicError } {
	const serialized = v.safeParse(trpcSerializedErrorWireSchema, error);
	if (serialized.success && "json" in serialized.output) {
		const jsonWire = v.safeParse(trpcPublicErrorWireSchema, serialized.output.json);
		return {
			json: sanitizePublicTrpcError(
				jsonWire.success ? jsonWire.output : undefined,
				fallbackHttpStatus,
			),
		};
	}

	const errorWire = v.safeParse(trpcPublicErrorWireSchema, error);
	return sanitizePublicTrpcError(
		errorWire.success ? errorWire.output : undefined,
		fallbackHttpStatus,
	);
}

function sanitizeResponseItem(
	item: v.InferOutput<typeof trpcResponseItemWireSchema>,
	fallbackHttpStatus: number,
): SanitizedTrpcResponse {
	if (item.error === undefined) {
		return { hasError: false, payload: item };
	}

	return {
		hasError: true,
		payload: {
			...item,
			error: sanitizeNestedTrpcError(item.error, fallbackHttpStatus),
		},
	};
}

/** Sanitize singular and batch tRPC JSON responses without changing wire layout. */
export function sanitizePublicTrpcResponse(
	wire: TrpcResponseWire,
	fallbackHttpStatus = 500,
): SanitizedTrpcResponse {
	if (!Array.isArray(wire)) {
		return sanitizeResponseItem(wire, fallbackHttpStatus);
	}

	let hasError = false;
	const payload = wire.map((item) => {
		const sanitized = sanitizeResponseItem(item, fallbackHttpStatus);
		hasError ||= sanitized.hasError;
		return sanitized.payload;
	});
	return { hasError, payload };
}
