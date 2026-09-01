import { trpcPublicErrorWireSchema } from "@vit/shared";
import * as v from "valibot";

import { thrownErrorWireSchema, type ThrownErrorWire } from "@/lib/error-wire";

export function trpcErrorCode(wire: ThrownErrorWire): string {
	const parsed = v.parse(thrownErrorWireSchema, wire);
	const trpc = v.safeParse(trpcPublicErrorWireSchema, parsed);
	return trpc.success ? (trpc.output.data?.code ?? "UNKNOWN") : "UNKNOWN";
}
