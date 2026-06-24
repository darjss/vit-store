import { defineTool } from "@flue/runtime";
import * as v from "valibot";

export type AssistantStockStatus = "in_stock" | "low_stock" | "out_of_stock";

// Catalog result shape the assistant operates on. Mirrors the api
// `AssistantProductResult` projection returned by the storefront product
// search procedure, so the agent app can hand search results straight through.
export interface AssistantProduct {
	id: number;
	slug: string;
	name: string;
	price: number;
	image: string;
	brand: string;
	stockStatus: AssistantStockStatus;
}

export interface ProductCardButton {
	label: string;
	payload: string;
}

// Channel-neutral product card. The Messenger channel maps this onto a
// generic-template element; a future storefront web widget can render the
// same shape its own way (ADR 0002).
export interface ProductCard {
	productId: number;
	title: string;
	subtitle: string;
	imageUrl?: string;
	button: ProductCardButton;
}

export const ORDER_BUTTON_LABEL = "Захиалах";

const ORDER_PAYLOAD_PREFIX = "order_product";

export const buildOrderPayload = (productId: number): string =>
	`${ORDER_PAYLOAD_PREFIX}:${productId}`;

export const parseOrderPayload = (payload: string): number | undefined => {
	const match = new RegExp(`^${ORDER_PAYLOAD_PREFIX}:(\\d+)$`).exec(payload);
	if (!match) return undefined;
	const id = Number(match[1]);
	return Number.isSafeInteger(id) ? id : undefined;
};

const STOCK_LABELS: Record<AssistantStockStatus, string> = {
	in_stock: "Бэлэн байгаа",
	low_stock: "Цөөн үлдсэн",
	out_of_stock: "Дууссан",
};

const formatPrice = (price: number): string =>
	`${Math.round(price).toLocaleString("en-US")}₮`;

export const formatProductCard = (product: AssistantProduct): ProductCard => {
	const brandPart = product.brand ? `${product.brand} · ` : "";
	return {
		productId: product.id,
		title: product.name,
		subtitle: `${brandPart}${formatPrice(product.price)} · ${STOCK_LABELS[product.stockStatus]}`,
		imageUrl: product.image || undefined,
		button: {
			label: ORDER_BUTTON_LABEL,
			payload: buildOrderPayload(product.id),
		},
	};
};

export const formatProductCards = (
	products: readonly AssistantProduct[],
): ProductCard[] => products.map(formatProductCard);

export const NO_MATCH_MESSAGE =
	"Уучлаарай, таны хайсан бараа олдсонгүй. Барааны нэр, брэнд эсвэл найрлагыг өөрөөр бичээд дахин оролдоно уу.";

export const PRODUCT_SEARCH_TOOL_NAME = "search_products";

export interface ProductSearchToolDeps {
	// Calls the existing storefront catalog search (do not duplicate catalog
	// logic). Returns the assistant projection, ordered by relevance.
	searchProducts: (query: string, limit: number) => Promise<AssistantProduct[]>;
	// Sends the formatted cards out on the bound channel.
	sendProductCards: (cards: ProductCard[]) => Promise<unknown>;
	// Sends a plain text reply (used for the no-match path).
	sendText: (text: string) => Promise<unknown>;
	limit?: number;
}

// Builds the conversation-bound product-search tool. The transport (catalog
// API client + channel senders) is injected so this stays reusable across
// channels and testable without a network.
export const buildProductSearchTool = (deps: ProductSearchToolDeps) => {
	const limit = deps.limit ?? 8;
	return defineTool({
		name: PRODUCT_SEARCH_TOOL_NAME,
		description:
			"Search the Vit Store catalog for products the customer asks about by name, brand, dose, or romanized-Mongolian fragment, then show the matches as Messenger product cards with a Захиалах (order) button. Call this whenever the customer names a product, brand, supplement, or dose they want to find or buy. On a match it sends the cards directly; on no match it sends a clear no-match reply.",
		input: v.object({
			query: v.pipe(
				v.string(),
				v.minLength(1),
				v.description(
					"The product, brand, dose, or romanized-Mongolian fragment the customer asked for, e.g. 'magnesium', 'vitamin d 1000', 'omega', 'tomor'.",
				),
			),
		}),
		async run({ input }) {
			const products = await deps.searchProducts(input.query, limit);

			if (products.length === 0) {
				await deps.sendText(NO_MATCH_MESSAGE);
				return {
					query: input.query,
					matchCount: 0,
					inStockCount: 0,
					outOfStockCount: 0,
					sent: "no_match_text",
					products: [],
				};
			}

			const cards = formatProductCards(products);
			await deps.sendProductCards(cards);

			const inStockCount = products.filter(
				(product) => product.stockStatus !== "out_of_stock",
			).length;

			return {
				query: input.query,
				matchCount: products.length,
				inStockCount,
				outOfStockCount: products.length - inStockCount,
				sent: "product_cards",
				products: products.map((product) => ({
					id: product.id,
					name: product.name,
					brand: product.brand,
					price: product.price,
					stockStatus: product.stockStatus,
				})),
			};
		},
	});
};
