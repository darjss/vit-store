// Exercises the REAL catalog transport boundary (src/lib/catalog.ts) against a
// throwaway local HTTP server that mimics the tRPC GET the store API serves.
// Nothing about catalog.ts is stubbed: real fetch, real SuperJSON deserialize,
// real v.parse(assistantProductSchema). Proves the HIGH-finding fix — a drifted
// wire shape now fails loudly at the boundary instead of yielding an undefined
// id and a dead `order_product:undefined` button.
//
// Usage: bun scripts/exercise-catalog-boundary.ts

import * as v from "valibot";
import { trpcResponse } from "../cli/trpc-stub";

let mode: "valid" | "drifted" = "valid";

const server = Bun.serve({
	fetch() {
		if (mode === "valid") {
			return new Response(
				trpcResponse([
					{
						brand: "NOW Foods",
						id: 101,
						image: "https://cdn.vit.mn/p/101.jpg",
						name: "Magnesium Glycinate 400mg",
						price: 54_900,
						slug: "magnesium-glycinate-400",
						stockStatus: "in_stock",
					},
				]),
				{ headers: { "content-type": "application/json" } },
			);
		}
		return new Response(
			trpcResponse([
				{
					brand: "NOW Foods",
					image: "https://cdn.vit.mn/p/101.jpg",
					name: "Magnesium Glycinate 400mg",
					price: 54_900,
					productId: 101,
					slug: "magnesium-glycinate-400",
					stockStatus: "in_stock",
				},
			]),
			{ headers: { "content-type": "application/json" } },
		);
	},
	port: 0,
});

process.env.STORE_API_URL = `http://localhost:${server.port}`;

const { searchAssistantProducts } = await import("../src/lib/catalog");
const { buildOrderPayload, parseOrderPayload } = await import("@vit/assistant");

const valibotIssueSchema = v.object({
	issues: v.optional(v.array(v.object({ message: v.string() }))),
});

mode = "valid";
const valid = await searchAssistantProducts("magnesium", 8);
const payload = buildOrderPayload(valid[0]!.id);
console.log("VALID PAYLOAD →", {
	decodesBackTo: parseOrderPayload(payload),
	orderPayload: payload,
	parsedId: valid[0]!.id,
});

mode = "drifted";
try {
	const drifted = await searchAssistantProducts("magnesium", 8);
	console.log("DRIFTED (UNEXPECTED, no throw) →", drifted);
} catch (error) {
	const parsed = v.safeParse(valibotIssueSchema, error);
	console.log("DRIFTED PAYLOAD → v.parse rejected at boundary:", {
		firstIssue: parsed.success ? parsed.output.issues?.[0]?.message : String(error),
		kind: error instanceof Error ? error.name : "unknown",
		threw: true,
	});
}

await server.stop(true);
