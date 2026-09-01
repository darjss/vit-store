import { trpcPublicErrorWireSchema } from "@vit/shared";
import { parse, safeParse } from "valibot";

import { thrownErrorWireSchema, type ThrownErrorWire } from "@/lib/error-wire";

export function trpcErrorCode(wire: ThrownErrorWire): string {
	const parsed = parse(thrownErrorWireSchema, wire);
	const trpc = safeParse(trpcPublicErrorWireSchema, parsed);
	return trpc.success ? (trpc.output.data?.code ?? "UNKNOWN") : "UNKNOWN";
}
