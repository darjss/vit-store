// Exercises the REAL catalog transport boundary (src/lib/catalog.ts) against a
// throwaway local HTTP server that mimics the tRPC GET the store API serves.
// Nothing about catalog.ts is stubbed: real fetch, real SuperJSON deserialize,
// real v.parse(assistantProductSchema). Proves the HIGH-finding fix — a drifted
// wire shape now fails loudly at the boundary instead of yielding an undefined
// id and a dead `order_product:undefined` button.
//
// Usage: bun scripts/exercise-catalog-boundary.ts

import { SuperJSON } from "superjson";

const trpcBody = (data: unknown) =>
	JSON.stringify({ result: { data: SuperJSON.serialize(data) } });

let mode: "valid" | "drifted" = "valid";

const server = Bun.serve({
	port: 0,
	fetch() {
		if (mode === "valid") {
			return new Response(
				trpcBody([
					{
						id: 101,
						slug: "magnesium-glycinate-400",
						name: "Magnesium Glycinate 400mg",
						price: 54900,
						image: "https://cdn.vit.mn/p/101.jpg",
						brand: "NOW Foods",
						stockStatus: "in_stock",
					},
				]),
				{ headers: { "content-type": "application/json" } },
			);
		}
		// api-side shape drift: `id` renamed to `productId`. The old unchecked
		// cast would have happily produced `id: undefined`.
		return new Response(
			trpcBody([
				{
					productId: 101,
					slug: "magnesium-glycinate-400",
					name: "Magnesium Glycinate 400mg",
					price: 54900,
					image: "https://cdn.vit.mn/p/101.jpg",
					brand: "NOW Foods",
					stockStatus: "in_stock",
				},
			]),
			{ headers: { "content-type": "application/json" } },
		);
	},
});

process.env.STORE_API_URL = `http://localhost:${server.port}`;

const { searchAssistantProducts } = await import("../src/lib/catalog");
const { buildOrderPayload, parseOrderPayload } = await import("@vit/assistant");

mode = "valid";
const valid = await searchAssistantProducts("magnesium", 8);
const payload = buildOrderPayload(valid[0]!.id);
console.log("VALID PAYLOAD →", {
	parsedId: valid[0]!.id,
	orderPayload: payload,
	decodesBackTo: parseOrderPayload(payload),
});

mode = "drifted";
try {
	const drifted = await searchAssistantProducts("magnesium", 8);
	console.log("DRIFTED (UNEXPECTED, no throw) →", drifted);
} catch (error) {
	console.log("DRIFTED PAYLOAD → v.parse rejected at boundary:", {
		threw: true,
		kind: error instanceof Error ? error.name : typeof error,
		firstIssue:
			(error as { issues?: Array<{ path?: unknown; message: string }> })
				.issues?.[0]?.message ?? String(error),
	});
}

await server.stop(true);
