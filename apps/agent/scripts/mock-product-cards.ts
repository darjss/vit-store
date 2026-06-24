// Small exerciser for the assistant product-search tool + Messenger card
// formatter. It stubs ONLY the catalog API boundary (search results) and the
// Graph transport; the real product-search tool, card formatter, and
// generic-template mapping run unchanged. Not a REPL (see issue #30).
//
// Usage: bun scripts/mock-product-cards.ts

process.env.MESSENGER_PAGE_ID ??= "TEST_PAGE_ID";
process.env.MESSENGER_PAGE_ACCESS_TOKEN ??= "TEST_PAGE_TOKEN";
process.env.MESSENGER_APP_SECRET ??= "TEST_APP_SECRET";
process.env.MESSENGER_VERIFY_TOKEN ??= "TEST_VERIFY_TOKEN";

const [{ messenger, sendProductCards, sendTextReply }, assistant] =
	await Promise.all([
		import("../src/channels/messenger"),
		import("@vit/assistant"),
	]);

const { buildProductSearchTool, parseOrderPayload } = assistant;
type AssistantProduct = import("@vit/assistant").AssistantProduct;

// Capture every outbound Graph call instead of hitting the network.
const emitted: unknown[] = [];
let nextMessageId = 200;
messenger.templates.generic = async (options) => {
	emitted.push({ kind: "generic_template", ...options });
	return { recipient_id: "stub", message_id: `mock-cards-${nextMessageId++}` };
};
messenger.send.message = async (request) => {
	emitted.push({ kind: "text", ...request });
	return { recipient_id: "stub", message_id: `mock-text-${nextMessageId++}` };
};

// Fixture catalog standing in for the storefront search API. Each query below
// exercises a representative shape; matching is a simple normalized substring
// over the name, brand, and romanized aliases so romanized-Mongolian fragments
// resolve the way the real transliterating search would.
const CATALOG: Array<AssistantProduct & { aliases: string[] }> = [
	{
		id: 101,
		slug: "magnesium-glycinate-400",
		name: "Magnesium Glycinate 400mg",
		brand: "NOW Foods",
		price: 54900,
		image: "https://cdn.vit.mn/p/101.jpg",
		stockStatus: "in_stock",
		aliases: ["magnesium", "magnes", "магни", "magni"],
	},
	{
		id: 202,
		slug: "iron-bisglycinate",
		name: "Төмөр (Iron) Bisglycinate 25mg",
		brand: "Solgar",
		price: 41900,
		image: "https://cdn.vit.mn/p/202.jpg",
		stockStatus: "low_stock",
		aliases: ["tomor", "iron", "төмөр", "temor"],
	},
	{
		id: 303,
		slug: "omega-3-fish-oil",
		name: "Omega-3 Fish Oil 1000mg",
		brand: "Carlson",
		price: 72900,
		image: "https://cdn.vit.mn/p/303.jpg",
		stockStatus: "out_of_stock",
		aliases: ["omega", "омега", "fish oil", "загас"],
	},
];

const normalize = (value: string) =>
	value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();

const stubSearch = async (
	query: string,
	limit: number,
): Promise<AssistantProduct[]> => {
	const q = normalize(query);
	return CATALOG.filter((product) =>
		[product.name, product.brand, ...product.aliases]
			.map(normalize)
			.some((field) => field.includes(q) || q.includes(field)),
	)
		.slice(0, limit)
		.map(({ aliases: _aliases, ...product }) => product);
};

const conversation = {
	pageId: process.env.MESSENGER_PAGE_ID as string,
	participant: { type: "page-scoped-id" as const, id: "TEST_CUSTOMER_PSID" },
};

const tool = buildProductSearchTool({
	searchProducts: stubSearch,
	sendProductCards: sendProductCards(conversation),
	sendText: sendTextReply(conversation),
});

const QUERIES = [
	{ label: "in-stock name fragment", query: "magnes" },
	{ label: "romanized-Mongolian (iron)", query: "tomor" },
	{ label: "out-of-stock", query: "omega" },
	{ label: "no-match", query: "xyzzy nonexistent" },
];

const runs: unknown[] = [];
for (const { label, query } of QUERIES) {
	emitted.length = 0;
	const result = await tool.run({ input: { query } });
	const outbound = structuredClone(emitted);

	// Prove every emitted Захиалах button payload decodes back to a product id.
	const buttonPayloads = outbound.flatMap((message) => {
		if (
			typeof message === "object" &&
			message !== null &&
			(message as { kind?: string }).kind === "generic_template"
		) {
			const elements =
				(
					message as {
						elements?: Array<{ buttons?: Array<{ payload?: string }> }>;
					}
				).elements ?? [];
			return elements.flatMap((element) =>
				(element.buttons ?? []).map((button) => ({
					payload: button.payload,
					decodedProductId: button.payload
						? parseOrderPayload(button.payload)
						: undefined,
				})),
			);
		}
		return [];
	});

	runs.push({ label, query, toolResult: result, outbound, buttonPayloads });
}

console.log(JSON.stringify({ runs }, null, 2));
