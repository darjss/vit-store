import { trpcResponseWireSchema } from "@vit/shared";
import {
	type InferOutput,
	looseObject,
	object,
	optional,
	parse,
	safeParse,
	string,
	union,
	unknown,
} from "valibot";

const trpcErrorCodeWireSchema = object({
	code: optional(string()),
	data: optional(object({ code: optional(string()) })),
});

const trpcSerializedErrorWireSchema = object({
	json: optional(unknown()),
});

const trpcResponseItemWireSchema = looseObject({
	error: optional(union([trpcSerializedErrorWireSchema, trpcErrorCodeWireSchema, unknown()])),
});

type TrpcErrorCodeWire = InferOutput<typeof trpcErrorCodeWireSchema>;
type TrpcResponseItemError = InferOutput<typeof trpcResponseItemWireSchema>["error"];

function errorWireIsUnauthorized(error: TrpcErrorCodeWire): boolean {
	return error.data?.code === "UNAUTHORIZED" || error.code === "UNAUTHORIZED";
}

function unauthorizedFromErrorWire(error: TrpcResponseItemError): boolean {
	if (error === undefined) {
		return false;
	}

	const direct = safeParse(trpcErrorCodeWireSchema, error);
	if (direct.success) {
		return errorWireIsUnauthorized(direct.output);
	}

	const serialized = safeParse(trpcSerializedErrorWireSchema, error);
	if (!serialized.success || serialized.output.json === undefined) {
		return false;
	}

	const nested = safeParse(trpcErrorCodeWireSchema, serialized.output.json);
	return nested.success ? errorWireIsUnauthorized(nested.output) : false;
}

export async function responseHasUnauthorizedTrpcError(response: Response): Promise<boolean> {
	if (response.status === 401) {
		return true;
	}

	try {
		const wire = parse(trpcResponseWireSchema, await response.clone().json());
		const items = Array.isArray(wire) ? wire : [wire];
		return items.some((item) => unauthorizedFromErrorWire(item.error));
	} catch {
		return false;
	}
}
