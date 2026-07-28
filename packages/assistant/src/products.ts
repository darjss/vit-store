import { defineTool } from "@flue/runtime";
import { type DeliveryFailure, deliveryFailureSchema } from "@vit/shared";
import type { Result as BetterResult } from "better-result";
import { matchAsync } from "dismatch/async";
import * as v from "valibot";
import { type AiOperationError, aiOperationErrorSchema } from "./errors";

export const assistantStockStatusSchema = v.picklist([
	"in_stock",
	"low_stock",
	"out_of_stock",
]);

export type AssistantStockStatus = v.InferOutput<
	typeof assistantStockStatusSchema
>;

// Runtime contract for the catalog result shape the assistant operates on.
// Mirrors the api `AssistantProductResult` projection returned by the
// storefront product search procedure. The hand-rolled tRPC transport
// (`apps/agent/src/lib/catalog.ts`) deserializes an untyped wire payload, so it
// MUST `v.parse(assistantProductSchema, ...)` at the boundary: that turns any
// api-side shape drift (renamed/removed field) into a loud parse error instead
// of an `undefined` id silently producing a dead `order_product:undefined`
// button. The exported type is derived from the schema so they cannot diverge.
export const assistantProductSchema = v.object({
	id: v.number(),
	slug: v.string(),
	name: v.string(),
	price: v.number(),
	image: v.string(),
	brand: v.string(),
	stockStatus: assistantStockStatusSchema,
});

export type AssistantProduct = v.InferOutput<typeof assistantProductSchema>;

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
const ORDER_PAYLOAD_RE = /^order_product:(\d+)$/;

export const buildOrderPayload = (productId: number): string =>
	`${ORDER_PAYLOAD_PREFIX}:${productId}`;

export const parseOrderPayload = (payload: string): number | undefined => {
	const match = ORDER_PAYLOAD_RE.exec(payload);
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

// Messenger generic-template elements cap title/subtitle at 80 chars each, and
// the whole element array fails if one field is over. Truncate defensively so a
// single long product name can't sink the entire card batch.
const MESSENGER_TITLE_MAX = 80;
const MESSENGER_SUBTITLE_MAX = 80;

const truncate = (text: string, max: number): string =>
	text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

export const formatProductCard = (product: AssistantProduct): ProductCard => {
	const brandPart = product.brand ? `${product.brand} · ` : "";
	return {
		productId: product.id,
		title: truncate(product.name, MESSENGER_TITLE_MAX),
		subtitle: truncate(
			`${brandPart}${formatPrice(product.price)} · ${STOCK_LABELS[product.stockStatus]}`,
			MESSENGER_SUBTITLE_MAX,
		),
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

// Soft reply when the catalog transport itself fails (timeout, network, tRPC
// error). Keeps the customer in the conversation instead of throwing the turn
// out with nothing user-facing.
export const SEARCH_ERROR_MESSAGE =
	"Уучлаарай, яг одоо барааны мэдээлэл авахад түр алдаа гарлаа. Хэсэг хүлээгээд дахин оролдоно уу.";

export const PRODUCT_SEARCH_TOOL_NAME = "search_products";

type ProductSearchFailure = Extract<
	AiOperationError,
	{ _tag: "ProviderUnavailable" }
>;

export interface ProductSearchToolDeps {
	searchProducts: (
		query: string,
		limit: number,
		signal?: AbortSignal,
	) => Promise<BetterResult<AssistantProduct[], ProductSearchFailure>>;
	sendProductCards: (
		cards: ProductCard[],
	) => Promise<BetterResult<unknown, DeliveryFailure>>;
	sendText: (text: string) => Promise<BetterResult<unknown, DeliveryFailure>>;
	limit?: number;
}

const deliveryAttemptSchema = v.variant("status", [
	v.strictObject({ status: v.literal("delivered") }),
	v.strictObject({
		status: v.literal("failed"),
		error: deliveryFailureSchema,
	}),
]);

export const productSearchToolOutputSchema = v.variant("status", [
	v.strictObject({
		status: v.literal("matched"),
		query: v.string(),
		matchCount: v.number(),
		inStockCount: v.number(),
		outOfStockCount: v.number(),
		delivery: deliveryAttemptSchema,
		products: v.array(
			v.strictObject({
				id: v.number(),
				name: v.string(),
				brand: v.string(),
				price: v.number(),
				stockStatus: assistantStockStatusSchema,
			}),
		),
	}),
	v.strictObject({
		status: v.literal("no_match"),
		query: v.string(),
		delivery: deliveryAttemptSchema,
	}),
	v.strictObject({
		status: v.literal("unavailable"),
		query: v.string(),
		error: aiOperationErrorSchema,
		delivery: deliveryAttemptSchema,
	}),
]);

type SearchOutcome =
	| { _tag: "Matched"; products: AssistantProduct[] }
	| { _tag: "NoMatch" }
	| { _tag: "Unavailable"; error: ProductSearchFailure };

const deliveryAttempt = (result: BetterResult<unknown, DeliveryFailure>) =>
	result.status === "ok"
		? { status: "delivered" as const }
		: { status: "failed" as const, error: result.error };

export const buildProductSearchTool = (deps: ProductSearchToolDeps) => {
	const limit = deps.limit ?? 8;
	return defineTool({
		name: PRODUCT_SEARCH_TOOL_NAME,
		description:
			"Search the Vit Store catalog and show validated product cards. A catalog outage is reported separately from a real no-match.",
		input: v.object({
			query: v.pipe(v.string(), v.minLength(1)),
		}),
		output: productSearchToolOutputSchema,
		async run({ input, signal }) {
			const result = await deps.searchProducts(input.query, limit, signal);
			const outcome: SearchOutcome =
				result.status === "error"
					? { _tag: "Unavailable", error: result.error }
					: result.value.length > 0
						? { _tag: "Matched", products: result.value }
						: { _tag: "NoMatch" };

			return matchAsync(
				outcome,
				"_tag",
			)<v.InferOutput<typeof productSearchToolOutputSchema>>({
				NoMatch: async () => ({
					status: "no_match" as const,
					query: input.query,
					delivery: deliveryAttempt(await deps.sendText(NO_MATCH_MESSAGE)),
				}),
				Unavailable: async ({ error }) => ({
					status: "unavailable" as const,
					query: input.query,
					error,
					delivery: deliveryAttempt(await deps.sendText(SEARCH_ERROR_MESSAGE)),
				}),
				Matched: async ({ products }) => {
					const inStockCount = products.filter(
						(product) => product.stockStatus !== "out_of_stock",
					).length;
					return {
						status: "matched" as const,
						query: input.query,
						matchCount: products.length,
						inStockCount,
						outOfStockCount: products.length - inStockCount,
						delivery: deliveryAttempt(
							await deps.sendProductCards(formatProductCards(products)),
						),
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
		},
	});
};
