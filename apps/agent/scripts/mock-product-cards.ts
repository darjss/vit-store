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

const [{ messenger, sendProductCards, sendTextReply }, assistant] = await Promise.all([
	import("../src/channels/messenger"),
	import("@vit/assistant"),
]);

const { buildProductSearchTool, parseOrderPayload } = assistant;
type AssistantProduct = import("@vit/assistant").AssistantProduct;

// Capture every outbound Graph call instead of hitting the network.
const emitted: Array<unknown> = [];
let nextMessageId = 200;
messenger.templates.generic = async (options) => {
	emitted.push({ kind: "generic_template", ...options });
	return { message_id: `mock-cards-${nextMessageId++}`, recipient_id: "stub" };
};
messenger.send.message = async (request) => {
	emitted.push({ kind: "text", ...request });
	return { message_id: `mock-text-${nextMessageId++}`, recipient_id: "stub" };
};

// Fixture catalog standing in for the storefront search API. Each query below
// exercises a representative shape; matching is a simple normalized substring
// over the name, brand, and romanized aliases so romanized-Mongolian fragments
// resolve the way the real transliterating search would.
const CATALOG: Array<AssistantProduct & { aliases: Array<string> }> = [
	{
		aliases: ["magnesium", "magnes", "магни", "magni"],
		brand: "NOW Foods",
		id: 101,
		image: "https://cdn.vit.mn/p/101.jpg",
		name: "Magnesium Glycinate 400mg",
		price: 54_900,
		slug: "magnesium-glycinate-400",
		stockStatus: "in_stock",
	},
	{
		aliases: ["tomor", "iron", "төмөр", "temor"],
		brand: "Solgar",
		id: 202,
		image: "https://cdn.vit.mn/p/202.jpg",
		name: "Төмөр (Iron) Bisglycinate 25mg",
		price: 41_900,
		slug: "iron-bisglycinate",
		stockStatus: "low_stock",
	},
	{
		aliases: ["omega", "омега", "fish oil", "загас"],
		brand: "Carlson",
		id: 303,
		image: "https://cdn.vit.mn/p/303.jpg",
		name: "Omega-3 Fish Oil 1000mg",
		price: 72_900,
		slug: "omega-3-fish-oil",
		stockStatus: "out_of_stock",
	},
];

const normalize = (value: string) =>
	value
		.normalize("NFKD")
		.toLowerCase()
		.replaceAll(/[^\p{L}\p{N}\s]+/gu, " ")
		.replaceAll(/\s+/g, " ")
		.trim();

const stubSearch = async (query: string, limit: number): Promise<Array<AssistantProduct>> => {
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
	participant: { id: "TEST_CUSTOMER_PSID", type: "page-scoped-id" as const },
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

const runs: Array<unknown> = [];
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
					decodedProductId: button.payload ? parseOrderPayload(button.payload) : undefined,
					payload: button.payload,
				})),
			);
		}
		return [];
	});

	runs.push({ buttonPayloads, label, outbound, query, toolResult: result });
}

console.log(JSON.stringify({ runs }, null, 2));
