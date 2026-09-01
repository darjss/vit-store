import { trpcResponseWireSchema } from "@vit/shared";
import * as v from "valibot";

const trpcErrorCodeWireSchema = v.object({
	code: v.optional(v.string()),
	data: v.optional(v.object({ code: v.optional(v.string()) })),
});

const trpcSerializedErrorWireSchema = v.object({
	json: v.optional(v.unknown()),
});

const trpcResponseItemWireSchema = v.looseObject({
	error: v.optional(v.union([trpcSerializedErrorWireSchema, trpcErrorCodeWireSchema, v.unknown()])),
});

type TrpcErrorCodeWire = v.InferOutput<typeof trpcErrorCodeWireSchema>;
type TrpcResponseItemError = v.InferOutput<typeof trpcResponseItemWireSchema>["error"];

function errorWireIsUnauthorized(error: TrpcErrorCodeWire): boolean {
	return error.data?.code === "UNAUTHORIZED" || error.code === "UNAUTHORIZED";
}

function unauthorizedFromErrorWire(error: TrpcResponseItemError): boolean {
	if (error === undefined) {
		return false;
	}

	const direct = v.safeParse(trpcErrorCodeWireSchema, error);
	if (direct.success) {
		return errorWireIsUnauthorized(direct.output);
	}

	const serialized = v.safeParse(trpcSerializedErrorWireSchema, error);
	if (!serialized.success || serialized.output.json === undefined) {
		return false;
	}

	const nested = v.safeParse(trpcErrorCodeWireSchema, serialized.output.json);
	return nested.success ? errorWireIsUnauthorized(nested.output) : false;
}

export async function responseHasUnauthorizedTrpcError(response: Response): Promise<boolean> {
	if (response.status === 401) {
		return true;
	}

	try {
		const wire = v.parse(trpcResponseWireSchema, await response.clone().json());
		const items = Array.isArray(wire) ? wire : [wire];
		return items.some((item) => unauthorizedFromErrorWire(item.error));
	} catch {
		return false;
	}
}
